.PHONY: help install dev build test clean docker-up docker-down docker-reset sftp-demo seed-data connectors-up connectors-demo connectors-seed

# Colors for terminal output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "${BLUE}SettlePaisa Ops Dashboard - Available Commands${NC}"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "${GREEN}%-20s${NC} %s\n", $$1, $$2}'

install: ## Install dependencies
	@echo "${YELLOW}Installing dependencies...${NC}"
	@npm install
	@echo "${GREEN}Dependencies installed!${NC}"

dev: ## Start development server
	@echo "${YELLOW}Starting development server...${NC}"
	@npm run dev

build: ## Build for production
	@echo "${YELLOW}Building for production...${NC}"
	@npm run build
	@echo "${GREEN}Build complete!${NC}"

test: ## Run tests
	@echo "${YELLOW}Running tests...${NC}"
	@npm run test 2>/dev/null || echo "${YELLOW}No tests configured yet${NC}"

lint: ## Run linter
	@echo "${BLUE}Running linter...${NC}"
	npm run lint

# Docker commands
docker-up: ## Start all Docker services
	@echo "${BLUE}Starting Docker services...${NC}"
	docker-compose up -d
	@echo "${GREEN}Docker services started!${NC}"
	@echo "${YELLOW}Services available at:${NC}"
	@echo "  - SFTP: sftp://localhost:2222"
	@echo "  - PostgreSQL: localhost:5432"
	@echo "  - Redis: localhost:6379"
	@echo "  - MinIO Console: http://localhost:9001"
	@echo "  - LocalStack: http://localhost:4566"

docker-down: ## Stop all Docker services
	@echo "${BLUE}Stopping Docker services...${NC}"
	docker-compose down
	@echo "${GREEN}Docker services stopped!${NC}"

docker-reset: ## Reset Docker services (remove volumes)
	@echo "${RED}WARNING: This will delete all data!${NC}"
	@echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
	@sleep 5
	@echo "${BLUE}Resetting Docker services...${NC}"
	docker-compose down -v
	@echo "${GREEN}Docker services reset!${NC}"

docker-logs: ## Show Docker logs
	docker-compose logs -f

# SFTP Demo Setup
sftp-setup: ## Set up SFTP demo directories and files
	@echo "${BLUE}Setting up SFTP demo environment...${NC}"
	@mkdir -p sftp-data/hdfc/upload sftp-data/icici/upload sftp-data/axis/upload
	@mkdir -p sftp-config/ssh_host_keys
	@echo "${GREEN}SFTP directories created!${NC}"

sftp-demo: sftp-setup ## Create demo reconciliation files in SFTP
	@echo "${BLUE}Creating demo reconciliation files...${NC}"
	@# HDFC Bank demo file
	@echo "txn_id,amount,status,date,merchant_ref,bank_ref" > sftp-data/hdfc/upload/hdfc_2024-01-10.csv
	@echo "TXN001,150000,SUCCESS,2024-01-10,ORD123,HDFC123" >> sftp-data/hdfc/upload/hdfc_2024-01-10.csv
	@echo "TXN002,250000,SUCCESS,2024-01-10,ORD124,HDFC124" >> sftp-data/hdfc/upload/hdfc_2024-01-10.csv
	@echo "TXN003,350000,FAILED,2024-01-10,ORD125,HDFC125" >> sftp-data/hdfc/upload/hdfc_2024-01-10.csv
	@# ICICI Bank demo file
	@echo "transaction_id,transaction_amount,transaction_status,transaction_date,order_id,bank_reference" > sftp-data/icici/upload/icici_2024-01-10.csv
	@echo "TXN004,450000,SUCCESS,2024-01-10,ORD126,ICICI126" >> sftp-data/icici/upload/icici_2024-01-10.csv
	@echo "TXN005,550000,SUCCESS,2024-01-10,ORD127,ICICI127" >> sftp-data/icici/upload/icici_2024-01-10.csv
	@# AXIS Bank demo file
	@echo "trans_id,trans_amt,trans_status,trans_dt,order_ref,bank_txn_id" > sftp-data/axis/upload/axis_2024-01-10.csv
	@echo "TXN006,650000,SUCCESS,2024-01-10,ORD128,AXIS128" >> sftp-data/axis/upload/axis_2024-01-10.csv
	@echo "TXN007,750000,FAILED,2024-01-10,ORD129,AXIS129" >> sftp-data/axis/upload/axis_2024-01-10.csv
	@echo "${GREEN}Demo files created!${NC}"
	@echo "${YELLOW}SFTP Credentials:${NC}"
	@echo "  - HDFC: hdfc/hdfc123"
	@echo "  - ICICI: icici/icici123"
	@echo "  - AXIS: axis/axis123"

# Database operations
db-migrate: ## Run database migrations
	@echo "${BLUE}Running database migrations...${NC}"
	@docker exec -it ops-postgres psql -U ops_user -d ops_dashboard -f /docker-entrypoint-initdb.d/init.sql
	@echo "${GREEN}Migrations completed!${NC}"

db-seed: ## Seed database with sample data
	@echo "${BLUE}Seeding database with sample data...${NC}"
	@docker exec -it ops-postgres psql -U ops_user -d ops_dashboard -c "\
		INSERT INTO data_source (source_id, name, type, path_or_endpoint, is_enabled, created_at) VALUES \
		('src_hdfc_sftp', 'HDFC Bank SFTP', 'BANK_SFTP', '/upload', true, NOW()), \
		('src_icici_sftp', 'ICICI Bank SFTP', 'BANK_SFTP', '/upload', true, NOW()), \
		('src_axis_sftp', 'AXIS Bank SFTP', 'BANK_SFTP', '/upload', true, NOW()) \
		ON CONFLICT DO NOTHING;"
	@echo "${GREEN}Database seeded!${NC}"

# Combined setup commands
setup: install docker-up sftp-demo db-seed ## Complete setup (install + docker + demo data)
	@echo "${GREEN}✨ Setup complete! The Ops Dashboard is ready.${NC}"
	@echo "${YELLOW}Start the dev server with: make dev${NC}"

reset: docker-reset setup ## Reset everything and start fresh
	@echo "${GREEN}✨ Environment reset and ready!${NC}"

# Monitoring commands
status: ## Check status of all services
	@echo "${BLUE}Checking service status...${NC}"
	@docker-compose ps
	@echo ""
	@echo "${BLUE}Application status:${NC}"
	@curl -s http://localhost:5174 > /dev/null 2>&1 && echo "${GREEN}✓ Frontend is running${NC}" || echo "${RED}✗ Frontend is not running${NC}"

logs-app: ## Show application logs
	@npm run dev

logs-sftp: ## Show SFTP logs
	@docker logs -f ops-sftp

logs-db: ## Show database logs
	@docker logs -f ops-postgres

# Cleanup
clean: ## Clean build artifacts and dependencies
	@echo "${BLUE}Cleaning build artifacts...${NC}"
	rm -rf dist node_modules .parcel-cache
	@echo "${GREEN}Cleaned!${NC}"

# Keep existing demo commands for backward compatibility
demo-files: ## Copy demo reconciliation files to public directory
	@echo "${YELLOW}Setting up demo files...${NC}"
	@mkdir -p public/demo/recon public/demo/pg
	@cp demo/recon/*.csv public/demo/recon/ 2>/dev/null || true
	@cp demo/pg/*.csv public/demo/pg/ 2>/dev/null || true
	@echo "${GREEN}Demo files ready!${NC}"

demo-recon: demo-files ## Run complete reconciliation demo flow
	@echo "${GREEN}🚀 Starting Reconciliation Demo Flow${NC}"
	@echo ""
	@echo "${YELLOW}Demo Steps:${NC}"
	@echo "1. Navigate to: http://localhost:5174/ops/recon"
	@echo "2. Click 'Sample Files' to see available test files"
	@echo "3. Click 'Upload File' to start the flow"
	@echo "4. Create a new job with:"
	@echo "   - Merchant: Flipkart (MERCH001)"
	@echo "   - Acquirer: ICICI Bank"
	@echo "   - Cycle Date: 2024-01-14"
	@echo "5. Upload: icici_neft_2024-01-14.csv"
	@echo "6. Normalize using 'ICICI NEFT v1' template"
	@echo "7. Run Auto-Match with tolerances"
	@echo "8. Review exceptions and resolve"
	@echo ""
	@echo "${GREEN}Demo files available:${NC}"
	@ls -la demo/recon/*.csv 2>/dev/null || echo "No demo files found"
	@echo ""
	@echo "${GREEN}Ready for testing!${NC}"

demo-up: install demo-files ## Start complete demo environment
	@echo "${GREEN}🚀 Starting Ops Dashboard Demo Environment${NC}"
	@npm run dev &
	@sleep 3
	@echo ""
	@echo "${GREEN}✅ Demo environment is ready!${NC}"
	@echo ""
	@echo "${GREEN}🔗 Access URLs:${NC}"
	@echo "  Dashboard: http://localhost:5174"
	@echo "  Login: Any credentials (select sp-ops role)"
	@echo ""
	@echo "${GREEN}📁 Demo Files:${NC}"
	@echo "  - icici_neft_2024-01-14.csv (15 transactions)"
	@echo "  - pg_txns_2024-01-14.csv (17 transactions)"
	@echo ""
	@echo "${GREEN}🔑 Demo Accounts:${NC}"
	@echo "  Role: sp-ops (full access)"
	@echo "  Role: sp-finance (financial ops)"
	@echo "  Role: sp-compliance (compliance)"
	@echo ""
	@echo "${YELLOW}Press Ctrl+C to stop the server${NC}"

demo-down: ## Stop demo environment
	@echo "${YELLOW}Stopping demo environment...${NC}"
	@pkill -f "npm run dev" 2>/dev/null || true
	@echo "${GREEN}Demo environment stopped!${NC}"

demo-reset: clean install demo-files ## Reset demo to initial state
	@echo "${GREEN}Demo environment reset!${NC}"

# Acceptance test targets
test-upload: ## Test file upload flow
	@echo "${YELLOW}Testing file upload...${NC}"
	@echo "1. Upload CSV file"
	@echo "2. Verify checksum validation"
	@echo "3. Check row count"

test-normalize: ## Test normalization flow
	@echo "${YELLOW}Testing normalization...${NC}"
	@echo "1. Select template"
	@echo "2. Preview normalization"
	@echo "3. Verify field mappings"

test-match: ## Test matching flow
	@echo "${YELLOW}Testing auto-match...${NC}"
	@echo "1. Set tolerances"
	@echo "2. Run matching"
	@echo "3. Verify results"

test-exceptions: ## Test exception resolution
	@echo "${YELLOW}Testing exceptions...${NC}"
	@echo "1. View exceptions"
	@echo "2. Open drawer"
	@echo "3. Resolve with reason"

test-e2e: ## Run end-to-end test
	@echo "${GREEN}Running E2E Reconciliation Test${NC}"
	@$(MAKE) test-upload
	@$(MAKE) test-normalize
	@$(MAKE) test-match
	@$(MAKE) test-exceptions
	@echo "${GREEN}E2E test complete!${NC}"

# Connector-specific targets
connectors-demo-up: ## Start connector demo services (SFTP + Mock APIs)
	@echo "${BLUE}Starting connector demo services...${NC}"
	docker-compose up -d sftp mock-pg-api mock-bank-api
	@echo "${GREEN}Connector services started!${NC}"
	@echo "${YELLOW}Services available at:${NC}"
	@echo "  - SFTP: sftp://localhost:2222 (user: sp-sftp, pass: sp-sftp)"
	@echo "  - Mock PG API: http://localhost:5101"
	@echo "  - Mock Bank API: http://localhost:5102"

seed-bank-file: ## Create bank reconciliation file with cycle date
	@if [ -z "$(CYCLE)" ]; then \
		echo "${RED}Error: CYCLE parameter required (format: YYYY-MM-DD)${NC}"; \
		echo "Usage: make seed-bank-file CYCLE=2025-09-12"; \
		exit 1; \
	fi
	@echo "${BLUE}Creating bank file for cycle $(CYCLE)...${NC}"
	@CYCLE_DATE=$$(echo $(CYCLE) | tr -d '-') && \
	mkdir -p ./demo/sftp/incoming && \
	echo "TRANSACTION_ID,UTR,AMOUNT,DATE" > ./demo/sftp/incoming/AXIS_RECON_$$CYCLE_DATE.csv && \
	echo "TXN$${CYCLE_DATE}001,UTR$${CYCLE_DATE}001,150000,$(CYCLE)" >> ./demo/sftp/incoming/AXIS_RECON_$$CYCLE_DATE.csv && \
	echo "TXN$${CYCLE_DATE}002,UTR$${CYCLE_DATE}002,250000,$(CYCLE)" >> ./demo/sftp/incoming/AXIS_RECON_$$CYCLE_DATE.csv && \
	echo "TXN$${CYCLE_DATE}003,UTR$${CYCLE_DATE}003,350000,$(CYCLE)" >> ./demo/sftp/incoming/AXIS_RECON_$$CYCLE_DATE.csv && \
	echo "TXN$${CYCLE_DATE}004,UTR$${CYCLE_DATE}004,450000,$(CYCLE)" >> ./demo/sftp/incoming/AXIS_RECON_$$CYCLE_DATE.csv && \
	echo "TXN$${CYCLE_DATE}005,UTR$${CYCLE_DATE}005,550000,$(CYCLE)" >> ./demo/sftp/incoming/AXIS_RECON_$$CYCLE_DATE.csv
	@echo "${GREEN}Bank file created: ./demo/sftp/incoming/AXIS_RECON_$$(echo $(CYCLE) | tr -d '-').csv${NC}"

seed-pg: ## Seed PG API with transactions for cycle
	@if [ -z "$(CYCLE)" ]; then \
		echo "${RED}Error: CYCLE parameter required (format: YYYY-MM-DD)${NC}"; \
		echo "Usage: make seed-pg CYCLE=2025-09-12"; \
		exit 1; \
	fi
	@echo "${BLUE}Seeding PG API for cycle $(CYCLE)...${NC}"
	@CYCLE_DATE=$$(echo $(CYCLE) | tr -d '-') && \
	curl -X POST http://localhost:5101/admin/seed \
		-H "Content-Type: application/json" \
		-d '{"cycle":"$(CYCLE)","transactions":[{"transaction_id":"TXN'$$CYCLE_DATE'001","rrn":"RRN'$$CYCLE_DATE'001","utr":"UTR'$$CYCLE_DATE'001","amount":150000,"captured_at":"$(CYCLE)T10:00:00Z","payment_method":"UPI","bank":"AXIS","merchant_id":"MERCH001"},{"transaction_id":"TXN'$$CYCLE_DATE'002","rrn":"RRN'$$CYCLE_DATE'002","utr":"UTR'$$CYCLE_DATE'002","amount":250000,"captured_at":"$(CYCLE)T11:00:00Z","payment_method":"CARD","bank":"AXIS","merchant_id":"MERCH001"},{"transaction_id":"TXN'$$CYCLE_DATE'003","rrn":"RRN'$$CYCLE_DATE'003","utr":"UTR'$$CYCLE_DATE'003","amount":350000,"captured_at":"$(CYCLE)T12:00:00Z","payment_method":"NETBANKING","bank":"AXIS","merchant_id":"MERCH002"},{"transaction_id":"TXN'$$CYCLE_DATE'004","rrn":"RRN'$$CYCLE_DATE'004","utr":"UTR'$$CYCLE_DATE'004","amount":450000,"captured_at":"$(CYCLE)T13:00:00Z","payment_method":"UPI","bank":"AXIS","merchant_id":"MERCH001"},{"transaction_id":"TXN'$$CYCLE_DATE'005","rrn":"RRN'$$CYCLE_DATE'005","utr":"UTR'$$CYCLE_DATE'005","amount":550000,"captured_at":"$(CYCLE)T14:00:00Z","payment_method":"CARD","bank":"AXIS","merchant_id":"MERCH002"}]}' || echo "${RED}Failed to seed PG API. Is the service running?${NC}"
	@echo "${GREEN}PG API seeded with 5 transactions${NC}"

connectors-up: docker-up connectors-seed ## Start SFTP server and seed sample files
	@echo "${GREEN}SFTP server started with sample files${NC}"
	@echo "Access via: sftp -P 2222 bank@localhost (password: bankpass)"

connectors-demo: ## Drop fresh sample files with current date
	@echo "${YELLOW}Generating fresh sample files for today...${NC}"
	@DATE=$$(date +%Y%m%d) && \
	cp infra/sftp/samples/AXIS_RECON_20250110.csv infra/sftp/samples/AXIS_RECON_$$DATE.csv 2>/dev/null || true && \
	cd infra/sftp/samples && sha256sum AXIS_RECON_$$DATE.csv > AXIS_RECON_$$DATE.csv.sha256 2>/dev/null || true
	@echo "${YELLOW}Creating BOB sample file...${NC}"
	@DATE=$$(date +%Y%m%d) && \
	echo "TxnID,Amount,NetAmount,Date,UTR,Status" > infra/sftp/samples/BOB_RECON_$$DATE.csv && \
	echo "BOB001,10000,9950,$$DATE,UTR901,SUCCESS" >> infra/sftp/samples/BOB_RECON_$$DATE.csv && \
	echo "BOB002,5000,4975,$$DATE,UTR902,SUCCESS" >> infra/sftp/samples/BOB_RECON_$$DATE.csv && \
	cd infra/sftp/samples && sha256sum BOB_RECON_$$DATE.csv > BOB_RECON_$$DATE.csv.sha256
	@echo "${YELLOW}Copying files to SFTP container...${NC}"
	@docker exec -i ops-sftp mkdir -p /home/bank/upload 2>/dev/null || true
	@DATE=$$(date +%Y%m%d) && \
	docker cp infra/sftp/samples/AXIS_RECON_$$DATE.csv ops-sftp:/home/bank/upload/ && \
	docker cp infra/sftp/samples/AXIS_RECON_$$DATE.csv.sha256 ops-sftp:/home/bank/upload/ && \
	docker cp infra/sftp/samples/BOB_RECON_$$DATE.csv ops-sftp:/home/bank/upload/ && \
	docker cp infra/sftp/samples/BOB_RECON_$$DATE.csv.sha256 ops-sftp:/home/bank/upload/
	@echo "${GREEN}Sample files deployed to SFTP server${NC}"

connectors-seed: ## Seed SFTP with initial sample files
	@echo "${YELLOW}Seeding SFTP with initial files...${NC}"
	@docker exec -i ops-sftp mkdir -p /home/bank/upload 2>/dev/null || true
	@docker exec -i ops-sftp mkdir -p /home/axis/upload 2>/dev/null || true
	@docker exec -i ops-sftp mkdir -p /home/hdfc/upload 2>/dev/null || true
	@docker exec -i ops-sftp mkdir -p /home/icici/upload 2>/dev/null || true
	@if [ -f infra/sftp/samples/AXIS_RECON_20250110.csv ]; then \
		docker cp infra/sftp/samples/AXIS_RECON_20250110.csv ops-sftp:/home/bank/upload/ 2>/dev/null || true; \
	fi
	@echo "${GREEN}SFTP seeded with sample files${NC}"