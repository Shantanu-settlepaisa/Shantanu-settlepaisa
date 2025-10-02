# SettlePaisa V2 Ops Dashboard - GPT Context Files

## 📋 **Complete Context Package for GPT/ChatGPT**

This directory contains comprehensive documentation designed specifically for GPT/ChatGPT to understand the complete SettlePaisa V2 Ops Dashboard system.

### 📂 **File Locations for GPT Upload**

```bash
# Core System Context Files
/Users/shantanusingh/ops-dashboard/docs/gpt-context/FRONTEND_CONTEXT.md
/Users/shantanusingh/ops-dashboard/docs/gpt-context/BACKEND_CONTEXT.md  
/Users/shantanusingh/ops-dashboard/docs/gpt-context/SYSTEM_OVERVIEW.md

# Database & Schema Context
/Users/shantanusingh/ops-dashboard/docs/context/DATASET_DICTIONARY.md
/Users/shantanusingh/ops-dashboard/docs/context/VIEWS_AND_LINEAGE.md
/Users/shantanusingh/ops-dashboard/docs/context/OPS_TILE_MAP.md
/Users/shantanusingh/ops-dashboard/docs/context/context_index.json

# Project Configuration
/Users/shantanusingh/ops-dashboard/package.json
/Users/shantanusingh/ops-dashboard/src/router.tsx
/Users/shantanusingh/ops-dashboard/vite.config.ts
```

## 🎯 **Context File Purposes**

### **1. SYSTEM_OVERVIEW.md**
**What it covers**: Complete business and technical overview
- Business context and stakeholders
- High-level architecture and data flow
- Core workflows (reconciliation, settlement, exception management)
- Security, performance, and deployment patterns
- **Best for**: Understanding the overall system purpose and architecture

### **2. FRONTEND_CONTEXT.md** 
**What it covers**: React application deep dive
- Component architecture and organization
- Routing structure and page hierarchy
- State management patterns (TanStack Query + Zustand)
- UI/UX patterns and design system
- Performance optimizations and development workflow
- **Best for**: Frontend development, UI changes, React component work

### **3. BACKEND_CONTEXT.md**
**What it covers**: Microservices backend architecture
- Service portfolio and responsibilities
- API endpoints and data flow patterns
- Database integration and query patterns
- Authentication/authorization implementation
- Performance monitoring and error handling
- **Best for**: Backend development, API changes, service integration

### **4. DATASET_DICTIONARY.md**
**What it covers**: Complete database schema
- 60+ tables with columns, primary keys, foreign keys
- Data relationships and constraints
- Source file locations for each table
- **Best for**: Database queries, schema understanding, data modeling

### **5. VIEWS_AND_LINEAGE.md**
**What it covers**: Database views and dependencies  
- 5 database views with dependencies
- Mermaid lineage diagrams
- Materialized view information
- **Best for**: Understanding data transformations and view dependencies

### **6. context_index.json**
**What it covers**: Machine-readable complete index
- All tables, views, endpoints, and frontend tiles
- Programmatic access to schema information
- **Best for**: Automated analysis, API discovery, data lineage

## 🔧 **Usage Instructions for GPT**

### **For General Questions**
Upload: `SYSTEM_OVERVIEW.md` + `DATASET_DICTIONARY.md`

### **For Frontend Development**
Upload: `FRONTEND_CONTEXT.md` + `SYSTEM_OVERVIEW.md` + `src/router.tsx`

### **For Backend Development** 
Upload: `BACKEND_CONTEXT.md` + `DATASET_DICTIONARY.md` + `context_index.json`

### **For Full System Understanding**
Upload all files for complete context (recommended for complex tasks)

## 📊 **Key System Facts for GPT**

### **Current State**
- **Version**: 2.3.1 (SQL ambiguity fixes)
- **URL**: http://localhost:5174/ops/overview
- **Database**: 60 tables, 5 views (PostgreSQL)
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js microservices (7 services)

### **Architecture Summary**
```
Frontend (5174) ──► Backend APIs (5101-5106) ──► PostgreSQL (5432)
                ├── Overview API (5105)
                ├── Recon API (5103) 
                ├── Mock PG API (5101)
                ├── Mock Bank API (5102)
                └── Merchant API (5106)
```

### **Core Workflows**
1. **Reconciliation**: File upload → Normalization → Auto-match → Exception resolution
2. **Settlement Pipeline**: Captured → In Settlement → Sent to Bank → Credited
3. **Exception Management**: Investigation → Resolution → Audit trail

### **User Roles**
- **sp-ops**: Full operations access
- **sp-finance**: Financial operations oversight  
- **sp-compliance**: Compliance and audit access
- **merchant-admin**: Merchant portal access

## 🚀 **Quick Start Commands**

```bash
# Generate fresh context documentation
make data-context

# Start development environment
npm run dev              # Frontend (port 5174)
./start-services.sh     # All backend services

# Access dashboard
http://localhost:5174/ops/overview
```

## 📝 **Context Maintenance**

These context files are automatically generated and should be regenerated when:
- Database schema changes
- New API endpoints are added
- Frontend components are restructured
- New services are introduced

```bash
# Regenerate all context
make data-context
```

This context package provides GPT with complete understanding of the SettlePaisa V2 Ops Dashboard system from business requirements through technical implementation.