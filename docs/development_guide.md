Platform: Development & Setup Guide

This guide provides instructions on how to set up and run the AST platform in a local development environment.

## 1. Prerequisites
* [Git](https://git-scm.com/)
* [Node.js](https://nodejs.org/) (see `.nvmrc` for specific version)
* [npm](https://www.npmjs.com/)
* [Docker](https://www.docker.com/) and `docker-compose`

## 2. Local Setup

### Step 1: Clone the Repository
```bash
git clone [repository-url]
cd ast-aros-financial-paradigm
Step 2: Install Dependencies
This project uses Node.js and TypeScript.

Bash

# Install all package.json dependencies
npm install
Step 3: Configure Environment
Copy the example environment file.

Bash

cp .env.example .env
Now, you must edit the .env file and provide valid secrets for local development (e.g., API keys for testing, local database passwords).

Step 4: Run Local Services (Docker)
The platform relies on several backing services (like databases, queues) that are managed by Docker Compose.

Bash

# This will start all services defined in docker-compose.yml
docker-compose up -d
Step 5: Build and Run the Application
Bash

# Compile the TypeScript code
npm run build

# Run the main server (see src/index.ts)
npm run start
The AST node and APIs should now be running locally.

3. Running Tests
This repository uses a multi-layered test strategy.

Bash

# Run fast unit tests
npm run test:unit

# Run module interaction tests
npm run test:integration

# Run full end-to-end smoke tests
npm run test:e2e
See docs/testing/Test_Strategy.md for details.

2. How to Write a New Test
Writing a Unit Test
Goal: Test a single function or class in isolation.

Location: tests/unit/

Example: You created a new helper function in src/platform/utils.ts.

Create a new file: tests/unit/utils.test.ts.

Import your function.

Write test cases using jest (describe, it, expect).

Mock all external dependencies (e.g., database calls, API calls).

Writing an Integration Test
Goal: Test the connection between two or more modules.

Location: tests/integration/

Example: You added a new API endpoint to src/platform/server.ts that uses src/platform/logger.ts.

Create a new file: tests/integration/my_endpoint.test.ts.

Start a real instance of the server in your test setup.

Use a client (like supertest) to make a real HTTP call to your new endpoint.

Assert that the endpoint returns the correct status code AND that the logger (which is not mocked) has received the correct message.

Writing an E2E Test
Goal: Test a full user story (e.g., the Tokenization flow).

Location: tests/e2e/

Example: Test the full tx/submit flow.

Create a new file: tests/e2e/transaction.test.ts.

In the beforeAll block, boot the entire system using docker-compose.

Step 1: Call the POST /tx/submit API.

Step 2: Poll the GET /tx/{txId} API until the status changes from "Pending" to "Finalized".

Step 3: Call the GET /account/{accountId}/balance API and assert that the balance has updated correctly.
