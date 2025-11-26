# api_phoenix

## Description

api_phoenix is a RESTful API built with Node.js, Express, and MongoDB. It provides endpoints for managing assets, projects, tasks, and transactions with JWT authentication and GitHub OAuth support.

## Features

- 🔐 JWT Authentication
- 🔑 GitHub OAuth Integration
- 🛡️ Security middleware (Helmet, CORS, XSS protection, Rate limiting)
- 🐳 Docker support for development and production
- 📊 RESTful API design

## Technologies Used

- Node.js
- Express
- MongoDB with Mongoose
- JSON Web Tokens (JWT)
- Passport.js (GitHub OAuth)
- bcryptjs
- Helmet, CORS, XSS-Clean
- Docker

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Monnyka/api_phoenix.git
   cd api_phoenix
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   Create `src/config/.env` with the following variables:

   ```env
   PORT=3000
   MONGOURL=your_mongo_connection_string
   DBNAME=phoenix
   JWT_SECRET=your_jwt_secret
   JWT_LIFETIME=30d
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   GITHUB_CALLBACK_URL=your_callback_url
   SESSION_SECRET=your_session_secret
   ```

## Usage

### Local Development

Start the server with hot-reload:

```bash
npm run dev
```

Or start in production mode:

```bash
npm start
```

The API will be running on port 3000 (or the port specified in your `.env` file).

### Docker

For Docker setup instructions, see [DOCKER.md](DOCKER.md).

Quick start with Docker:

```bash
# Development mode with hot-reload
npm run docker:dev

# Production mode
npm run docker:prod
```

## API Endpoints

| Resource       | Base URL              | Authentication |
| -------------- | --------------------- | -------------- |
| Authentication | `/api/v1/auth`        | No             |
| Tasks          | `/api/v1/tasks`       | Yes (JWT)      |
| Projects       | `/api/v1/projects`    | Yes (JWT)      |
| Assets         | `/api/v1/assets`      | Yes (JWT)      |
| Transactions   | `/api/v1/transactions`| Yes (JWT)      |

## Available Scripts

| Script              | Description                          |
| ------------------- | ------------------------------------ |
| `npm start`         | Start the server                     |
| `npm run dev`       | Start with nodemon (hot-reload)      |
| `npm run docker:dev`| Run in Docker development mode       |
| `npm run docker:prod`| Run in Docker production mode       |
| `npm run docker:logs`| View Docker container logs          |

## Git Workflow

1. Create a feature branch:

   ```bash
   git switch -c feature-name
   ```

2. Switch to master branch:

   ```bash
   git switch master
   ```

3. Merge feature branch to master:

   ```bash
   git merge feature-name
   ```

## License

ISC
