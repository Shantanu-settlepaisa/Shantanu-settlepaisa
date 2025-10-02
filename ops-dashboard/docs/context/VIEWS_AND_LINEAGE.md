# Views & Materialized Views


## Inventory


| View                    | Materialized   | Depends On   |
|-------------------------|----------------|--------------|
| connector_health        | no             | -            |
| v_connector_health      | no             | -            |
| v_pipeline_overview     | no             | -            |
| v_source_breakdown      | no             | -            |
| v_top_exception_reasons | no             | -            |
## Lineage (Mermaid)


```mermaid
flowchart LR
  connector_health["connector_health"]
  v_connector_health["v_connector_health"]
  v_pipeline_overview["v_pipeline_overview"]
  v_source_breakdown["v_source_breakdown"]
  v_top_exception_reasons["v_top_exception_reasons"]
```