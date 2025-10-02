#!/usr/bin/env python3
"""
Crawls the repo to build an end-to-end context:
- Parse DDL/SQL (tables, columns, PK/FK, indexes; views & materialized views)
- Parse backend code for endpoints and SQL/ORM to map API→SQL→tables
- Parse frontend code for tile components and API calls
- Emit Markdown docs + a JSON index for machines
"""

import os, re, json, glob, sqlparse, yaml
from pathlib import Path
from collections import defaultdict
from tabulate import tabulate
from tqdm import tqdm
try:
    import sqlglot
    from sqlglot import parse_one
except Exception:
    sqlglot = None

ROOT = Path(".").resolve()
OUT_DIR = ROOT / "docs" / "context"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# -------------------------
# Helpers
# -------------------------
def read_text(p):
    try:
        return Path(p).read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""

def find_files(patterns):
    files = []
    for pat in patterns:
        files.extend(glob.glob(pat, recursive=True))
    return sorted(set(files))

def md_h1(s): return f"# {s}\n\n"
def md_h2(s): return f"## {s}\n\n"
def md_h3(s): return f"### {s}\n\n"

# -------------------------
# 1) Parse SQL DDL / Views
# -------------------------
SQL_GLOBS = [
    "ddl/**/*.sql", "migrations/**/*.sql", "jobs/**/*.sql", "recon/**/*.sql", "scripts/**/*.sql",
    "**/*.sql"
]

TABLES = {}            # {schema.table: {"columns":[(name,type)],"pk":[...],"fks":[(col, ref_table, ref_col)], "indexes":[...], "comment": str}}
VIEWS = {}             # {schema.view: {"sql": str, "deps":[schema.table], "materialized": bool}}
DEPENDENCIES = defaultdict(set)

CREATE_TABLE_RE = re.compile(r"CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(?P<name>[\w\.]+)", re.I)
CREATE_VIEW_RE  = re.compile(r"CREATE\s+(MATERIALIZED\s+)?VIEW\s+(IF\s+NOT\s+EXISTS\s+)?(?P<name>[\w\.]+)", re.I)

def parse_sql_files():
    files = find_files(SQL_GLOBS)
    for f in tqdm(files, desc="Scanning SQL"):
        txt = read_text(f)
        if not txt.strip():
            continue

        # Rough capture create table/view names
        for m in CREATE_TABLE_RE.finditer(txt):
            name = m.group("name").strip().strip('"')
            TABLES.setdefault(name, {"columns":[], "pk":[], "fks":[], "indexes":[], "comment": f"from {f}"})

        for m in CREATE_VIEW_RE.finditer(txt):
            name = m.group("name").strip().strip('"')
            is_mat = "MATERIALIZED" in m.group(0).upper()
            VIEWS.setdefault(name, {"sql":"", "deps":[], "materialized": is_mat})
            VIEWS[name]["sql"] = txt

        # Try to parse column lists, PKs, FKs (best-effort)
        stmts = [s for s in sqlparse.split(txt) if s.strip()]
        for s in stmts:
            s_up = s.upper()
            tbl_match = CREATE_TABLE_RE.search(s)
            if tbl_match:
                tname = tbl_match.group("name").strip().strip('"')
                # naive column parser: lines within parens after CREATE TABLE ...
                paren = s[s.index("(")+1 : s.rindex(")")] if "(" in s and ")" in s else ""
                for line in [l.strip().strip(",") for l in paren.splitlines() if l.strip()]:
                    if line.upper().startswith(("PRIMARY KEY","FOREIGN KEY","UNIQUE","CONSTRAINT")):
                        if "PRIMARY KEY" in line.upper():
                            cols = re.findall(r"\((.*?)\)", line)
                            if cols:
                                pkcols = [c.strip().strip('"') for c in cols[0].split(",")]
                                TABLES[tname]["pk"].extend(pkcols)
                        if "FOREIGN KEY" in line.upper():
                            # FOREIGN KEY (col) REFERENCES schema.table(ref)
                            fk_col = re.findall(r"FOREIGN KEY\s*\((.*?)\)", line, flags=re.I)
                            ref = re.findall(r"REFERENCES\s+([\w\.]+)\s*\((.*?)\)", line, flags=re.I)
                            if fk_col and ref:
                                c = fk_col[0].split(",")[0].strip().strip('"')
                                ref_table = ref[0][0].strip().strip('"')
                                ref_col = ref[0][1].split(",")[0].strip().strip('"')
                                TABLES[tname]["fks"].append((c, ref_table, ref_col))
                                DEPENDENCIES[tname].add(ref_table)
                    else:
                        # column name + type (best-effort)
                        parts = line.split()
                        if parts:
                            cname = parts[0].strip('"')
                            ctype = parts[1] if len(parts)>1 else ""
                            TABLES[tname]["columns"].append((cname, ctype))

        # For views: try sqlglot lineage if available
        if sqlglot:
            for vname, v in list(VIEWS.items()):
                if v["sql"]:
                    try:
                        ast = parse_one(v["sql"], read="postgres")
                        # collect table identifiers
                        for tbl in ast.find_all(sqlglot.expressions.Table):
                            DEPENDENCIES[vname].add(".".join([p for p in [tbl.args.get('db'), tbl.name] if p]))
                        VIEWS[vname]["deps"] = sorted(DEPENDENCIES[vname])
                    except Exception:
                        pass

# -------------------------
# 2) Backend scan: API→SQL
# -------------------------
BACKEND_GLOBS = ["backend/**/*.*", "apps/**/*.*", "services/**/*.*", "src/**/*.*", "api/**/*.*"]
SQL_INLINE_RE = re.compile(r"(SELECT|INSERT|UPDATE|DELETE)\s+.+?;", re.I | re.S)

ENDPOINTS = []  # [{"method","path","file","line","sql_snippet","tables"}]

def parse_backend():
    files = find_files(BACKEND_GLOBS)
    for f in tqdm(files, desc="Scanning backend"):
        if any(f.endswith(ext) for ext in (".sql",".md",".png",".jpg",".map",".lock",".min.js",".min.css")):
            continue
        txt = read_text(f)
        if not txt: 
            continue

        # try to detect routes (FastAPI/Express/Django-ish)
        for m in re.finditer(r'@(get|post|put|patch|delete)\(["\']([^"\']+)["\']', txt, flags=re.I):
            method = m.group(1).upper()
            path = m.group(2)
            ENDPOINTS.append({"method":method,"path":path,"file":f,"line":txt[:m.start()].count("\n")+1,"sql_snippet":"","tables":[]})

        for m in re.finditer(r'(app\.(get|post|put|patch|delete)\(|router\.(get|post|put|patch|delete)\() *["\']([^"\']+)["\']', txt, flags=re.I):
            method = (m.group(2) or m.group(3) or "").upper()
            path = m.group(4)
            ENDPOINTS.append({"method":method,"path":path,"file":f,"line":txt[:m.start()].count("\n")+1,"sql_snippet":"","tables":[]})

        # inline SQL
        for m in SQL_INLINE_RE.finditer(txt):
            sql = m.group(0)
            tables = []
            if sqlglot:
                try:
                    ast = parse_one(sql, read="postgres")
                    tables = sorted({ ".".join([p for p in [t.args.get('db'), t.name] if p]) for t in ast.find_all(sqlglot.expressions.Table) })
                except Exception:
                    pass
            # attach to nearest endpoint we saw in same file
            if ENDPOINTS:
                ENDPOINTS[-1]["sql_snippet"] = sql.strip()
                ENDPOINTS[-1]["tables"] = tables

# -------------------------
# 3) Frontend scan: Tile→API
# -------------------------
FRONTEND_GLOBS = ["frontend/**/*.*", "web/**/*.*", "dashboard/**/*.*", "ui/**/*.*", "apps/**/*.*"]

TILES = []  # [{"tile","component","file","api_method","api_path"}]

def parse_frontend():
    files = find_files(FRONTEND_GLOBS)
    for f in tqdm(files, desc="Scanning frontend"):
        if any(f.endswith(ext) for ext in (".css",".scss",".md",".map",".png",".jpg",".ico",".lock",".svg",".mdx")):
            continue
        txt = read_text(f)
        if not txt:
            continue

        # naive component name
        comp = None
        m = re.search(r'export\s+default\s+function\s+(\w+)|const\s+(\w+)\s*=\s*\(', txt)
        comp = (m.group(1) or m.group(2)) if m else Path(f).stem

        # detect fetch/axios calls
        for m in re.finditer(r'(fetch|axios\.(get|post|put|patch|delete))\(\s*["\']([^"\']+)["\']', txt, flags=re.I):
            method = (m.group(2) or "GET").upper()
            path = m.group(3)
            # tile name heuristic: H1/H2 title or component name
            title_match = re.search(r'<h[12][^>]*>([^<]+)</h[12]>', txt)
            tile = title_match.group(1).strip() if title_match else comp
            TILES.append({"tile":tile, "component":comp, "file":f, "api_method":method, "api_path":path})

# -------------------------
# 4) Emit docs + JSON index
# -------------------------
def emit():
    # Dataset dictionary
    dict_rows = []
    for t, meta in sorted(TABLES.items()):
        cols = ", ".join([c for c,_ in meta["columns"]][:10])
        pk = ", ".join(meta["pk"]) if meta["pk"] else ""
        fks = "; ".join([f"{c}->{r}.{rc}" for c,r,rc in meta["fks"]]) if meta["fks"] else ""
        dict_rows.append([t, cols or "(…)", pk or "-", fks or "-", meta.get("comment","")])

    dataset_md = []
    dataset_md.append(md_h1("SettlePaisa V2 — Dataset Dictionary"))
    dataset_md.append("Columns are truncated to the first 10 for readability.\n\n")
    dataset_md.append(tabulate([["Dataset","Columns (sample)","PK","FKs","Source"]] + dict_rows, headers="firstrow", tablefmt="github"))
    (OUT_DIR / "DATASET_DICTIONARY.md").write_text("\n".join(dataset_md), encoding="utf-8")

    # Views + lineage
    views_md = [md_h1("Views & Materialized Views"), md_h2("Inventory")]
    vrows = [["View","Materialized","Depends On"]]
    for v, meta in sorted(VIEWS.items()):
        vrows.append([v, "yes" if meta.get("materialized") else "no", ", ".join(meta.get("deps",[])) or "-"])
    views_md.append(tabulate(vrows, headers="firstrow", tablefmt="github"))

    # Mermaid lineage
    mermaid = ["flowchart LR"]
    for v, meta in sorted(VIEWS.items()):
        vn = v.replace(".","_")
        mermaid.append(f'  {vn}["{v}"]')
        for dep in meta.get("deps",[]):
            dn = dep.replace(".","_")
            mermaid.append(f'  {dn}["{dep}"] --> {vn}')
    views_md.append(md_h2("Lineage (Mermaid)"))
    views_md.append("```mermaid\n" + "\n".join(mermaid) + "\n```")
    (OUT_DIR / "VIEWS_AND_LINEAGE.md").write_text("\n".join(views_md), encoding="utf-8")

    # Tile → API → SQL → Tables
    tile_rows = [["Tile","Frontend Component","API (method path)","Tables / Views (detected)","Source"]]
    # map endpoints to tables for join
    by_key = {(e["method"], e["path"]): e for e in ENDPOINTS}
    for t in TILES:
        e = by_key.get((t["api_method"], t["api_path"]))
        tabs = ", ".join(e["tables"]) if e and e["tables"] else "-"
        src = f'{t["file"]}'
        tile_rows.append([t["tile"], t["component"], f'{t["api_method"]} {t["api_path"]}', tabs, src])
    tile_md = [md_h1("Ops Dashboard Tile → API → SQL/View → Tables"), tabulate(tile_rows, headers="firstrow", tablefmt="github")]
    (OUT_DIR / "OPS_TILE_MAP.md").write_text("\n".join(tile_md), encoding="utf-8")

    # Schema context (summary)
    schema_md = [md_h1("Schema Context (sp_v2)"), md_h2("Tables"), f"- Total tables parsed: **{len(TABLES)}**\n", md_h2("Views"), f"- Total views parsed: **{len(VIEWS)}**\n"]
    (OUT_DIR / "SCHEMA_CONTEXT.md").write_text("\n".join(schema_md), encoding="utf-8")

    # JSON index for machines
    index = {
        "tables": TABLES,
        "views": VIEWS,
        "dependencies": {k:list(v) for k,v in DEPENDENCIES.items()},
        "endpoints": ENDPOINTS,
        "tiles": TILES
    }
    (OUT_DIR / "context_index.json").write_text(json.dumps(index, indent=2), encoding="utf-8")

def main():
    parse_sql_files()
    parse_backend()
    parse_frontend()
    emit()
    print(f"Wrote: {OUT_DIR}/DATASET_DICTIONARY.md")
    print(f"Wrote: {OUT_DIR}/VIEWS_AND_LINEAGE.md")
    print(f"Wrote: {OUT_DIR}/OPS_TILE_MAP.md")
    print(f"Wrote: {OUT_DIR}/SCHEMA_CONTEXT.md")
    print(f"Wrote: {OUT_DIR}/context_index.json")

if __name__ == "__main__":
    main()