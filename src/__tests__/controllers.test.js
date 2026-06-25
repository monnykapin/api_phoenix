// Set up env vars BEFORE any requires that may transitively load passport.js
process.env.JWT_SECRET = "controller-test-secret";
process.env.JWT_LIFETIME = "1h";
process.env.REFRESH_TOKEN_SECRET = "controller-refresh-secret";
process.env.REFRESH_TOKEN_LIFETIME = "7d";
process.env.GITHUB_CLIENT_ID = "test-client-id";
process.env.GITHUB_CLIENT_SECRET = "test-client-secret";
process.env.SESSION_SECRET = "test-session-secret";

const request = require("supertest");
const express = require("express");
const mongoose = require("mongoose");

const Guest = require("../models/Guest");
const Task = require("../models/Task");
const Project = require("../models/Project");
const User = require("../models/User");

const guestRoutes = require("../routes/guest");
const taskRoutes = require("../routes/task");
const projectRoutes = require("../routes/project");
const authRoutes = require("../routes/auth");

const errorHandlerMiddleware = require("../middleware/error-handler");
const db = require("./db");

beforeAll(async () => {
  await db.connect();
});

afterAll(async () => {
  await db.disconnect();
});

afterEach(async () => {
  await db.cleanup();
});

// Helper to create an Express app with auth middleware that injects a test user
const createAppWithAuth = (routes, mountPath) => {
  const app = express();
  app.use(express.json());

  // Mock auth middleware that injects a fake user
  app.use((req, res, next) => {
    req.user = { userId: new mongoose.Types.ObjectId(), name: "Test User" };
    next();
  });

  app.use(mountPath, routes);
  app.use(errorHandlerMiddleware);
  return app;
};

// App WITHOUT auth for auth routes (register/login don't need auth)
const createAppWithoutAuth = (routes, mountPath) => {
  const app = express();
  app.use(express.json());
  app.use(mountPath, routes);
  app.use(errorHandlerMiddleware);
  return app;
};

describe("Guest Controller", () => {
  let app;

  beforeEach(() => {
    app = createAppWithAuth(guestRoutes, "/api/v1/guests");
  });

  describe("POST /api/v1/guests", () => {
    it("should create a guest", async () => {
      const res = await request(app)
        .post("/api/v1/guests")
        .send({
          guestName: "Test Guest",
          guestLocation: "Phnom Penh",
          amount: 200,
          currency: "USD",
        })
        .expect(201);

      expect(res.body.guest.guestName).toBe("Test Guest");
      expect(res.body.guest.status).toBe("incoming");
      expect(res.body.guest.amount).toBe(200);
    });

    it("should return 400 when required fields are missing", async () => {
      const res = await request(app)
        .post("/api/v1/guests")
        .send({ amount: 100 })
        .expect(400);

      expect(res.body.msg).toBeDefined();
    });
  });

  describe("GET /api/v1/guests", () => {
    it("should return all guests for the authenticated user", async () => {
      const userId = new mongoose.Types.ObjectId();

      const appCustom = express();
      appCustom.use(express.json());
      appCustom.use((req, res, next) => {
        req.user = { userId, name: "Test" };
        next();
      });
      appCustom.use("/api/v1/guests", guestRoutes);
      appCustom.use(errorHandlerMiddleware);

      await Guest.create([
        { guestName: "G1", guestLocation: "PP", createdBy: userId },
        { guestName: "G2", guestLocation: "SR", createdBy: userId },
        {
          guestName: "G3",
          guestLocation: "BTB",
          createdBy: new mongoose.Types.ObjectId(),
        },
      ]);

      const res = await request(appCustom)
        .get("/api/v1/guests")
        .expect(200);

      expect(res.body.guests.length).toBe(2);
    });

    it("should filter by status query param", async () => {
      const userId = new mongoose.Types.ObjectId();

      const appCustom = express();
      appCustom.use(express.json());
      appCustom.use((req, res, next) => {
        req.user = { userId, name: "Test" };
        next();
      });
      appCustom.use("/api/v1/guests", guestRoutes);
      appCustom.use(errorHandlerMiddleware);

      await Guest.create([
        {
          guestName: "G1",
          guestLocation: "PP",
          status: "incoming",
          createdBy: userId,
        },
        {
          guestName: "G2",
          guestLocation: "SR",
          status: "settled",
          createdBy: userId,
        },
      ]);

      const res = await request(appCustom)
        .get("/api/v1/guests?status=settled")
        .expect(200);

      expect(res.body.guests.length).toBe(1);
      expect(res.body.guests[0].status).toBe("settled");
    });
  });

  describe("GET /api/v1/guests/:id", () => {
    it("should return a guest by id", async () => {
      const guest = await Guest.create({
        guestName: "Single Guest",
        guestLocation: "PP",
        createdBy: new mongoose.Types.ObjectId(),
      });

      const res = await request(app)
        .get(`/api/v1/guests/${guest._id}`)
        .expect(200);

      expect(res.body.guest.guestName).toBe("Single Guest");
    });

    it("should return 404 for non-existent guest", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/v1/guests/${fakeId}`)
        .expect(404);

      expect(res.body.msg).toContain("No guest found");
    });
  });

  describe("PATCH /api/v1/guests/:id", () => {
    it("should update a guest", async () => {
      const guest = await Guest.create({
        guestName: "Old Name",
        guestLocation: "PP",
        createdBy: new mongoose.Types.ObjectId(),
      });

      const res = await request(app)
        .patch(`/api/v1/guests/${guest._id}`)
        .send({ guestName: "New Name", amount: 500 })
        .expect(200);

      expect(res.body.guest.guestName).toBe("New Name");
      expect(res.body.guest.amount).toBe(500);
    });

    it("should return 404 when updating non-existent guest", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .patch(`/api/v1/guests/${fakeId}`)
        .send({ guestName: "Updated" })
        .expect(404);

      expect(res.body.msg).toContain("No guest found");
    });
  });

  describe("DELETE /api/v1/guests/:id", () => {
    it("should delete a guest", async () => {
      const guest = await Guest.create({
        guestName: "To Delete",
        guestLocation: "PP",
        createdBy: new mongoose.Types.ObjectId(),
      });

      const res = await request(app)
        .delete(`/api/v1/guests/${guest._id}`)
        .expect(200);

      expect(res.body.guest._id).toBe(guest._id.toString());

      const found = await Guest.findById(guest._id);
      expect(found).toBeNull();
    });

    it("should return 404 when deleting non-existent guest", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/v1/guests/${fakeId}`)
        .expect(404);

      expect(res.body.msg).toContain("No guest found");
    });
  });
});

describe("Task Controller", () => {
  let app;

  beforeEach(() => {
    app = createAppWithAuth(taskRoutes, "/api/v1/tasks");
  });

  describe("POST /api/v1/tasks", () => {
    it("should create a task", async () => {
      const res = await request(app)
        .post("/api/v1/tasks")
        .send({
          name: "New Task",
          description: "Do something",
        })
        .expect(201);

      expect(res.body.task.name).toBe("New Task");
      expect(res.body.task.completed).toBe(false);
      expect(res.body.task.status).toBe("pending");
    });
  });

  describe("POST /api/v1/tasks/bulk", () => {
    it("should create multiple tasks in bulk", async () => {
      const res = await request(app)
        .post("/api/v1/tasks/bulk")
        .send([
          { name: "Task 1" },
          { name: "Task 2", description: "Second task" },
        ])
        .expect(201);

      expect(res.body.tasks.length).toBe(2);
    });

    it("should return 400 for empty array", async () => {
      const res = await request(app)
        .post("/api/v1/tasks/bulk")
        .send([])
        .expect(400);
    });

    it("should return 400 for non-array body", async () => {
      const res = await request(app)
        .post("/api/v1/tasks/bulk")
        .send({ name: "Not array" })
        .expect(400);
    });
  });

  describe("GET /api/v1/tasks", () => {
    it("should filter tasks by completed status", async () => {
      const userId = new mongoose.Types.ObjectId();

      const appCustom = express();
      appCustom.use(express.json());
      appCustom.use((req, res, next) => {
        req.user = { userId, name: "Test" };
        next();
      });
      appCustom.use("/api/v1/tasks", taskRoutes);
      appCustom.use(errorHandlerMiddleware);

      await Task.create([
        { name: "T1", completed: true, createdBy: userId },
        { name: "T2", completed: false, createdBy: userId },
        { name: "T3", completed: false, createdBy: userId },
      ]);

      const res = await request(appCustom)
        .get("/api/v1/tasks?completed=false")
        .expect(200);

      expect(res.body.tasks.length).toBe(2);
    });

    it("should return all tasks when all=true", async () => {
      const userId = new mongoose.Types.ObjectId();
      const otherId = new mongoose.Types.ObjectId();

      const appCustom = express();
      appCustom.use(express.json());
      appCustom.use((req, res, next) => {
        req.user = { userId, name: "Test" };
        next();
      });
      appCustom.use("/api/v1/tasks", taskRoutes);
      appCustom.use(errorHandlerMiddleware);

      await Task.create([
        { name: "T1", createdBy: userId },
        { name: "T2", createdBy: otherId },
      ]);

      const res = await request(appCustom)
        .get("/api/v1/tasks?all=true")
        .expect(200);

      expect(res.body.tasks.length).toBe(2);
    });
  });

  describe("GET /api/v1/tasks/:id", () => {
    it("should return a task by id", async () => {
      const task = await Task.create({
        name: "Find Me",
        createdBy: new mongoose.Types.ObjectId(),
      });

      const res = await request(app)
        .get(`/api/v1/tasks/${task._id}`)
        .expect(200);

      expect(res.body.task.name).toBe("Find Me");
    });

    it("should return 404 for non-existent task", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/v1/tasks/${fakeId}`)
        .expect(404);

      expect(res.body.msg).toContain("No task found");
    });
  });

  describe("PATCH /api/v1/tasks/:id", () => {
    it("should update a task", async () => {
      const task = await Task.create({
        name: "Old Task",
        createdBy: new mongoose.Types.ObjectId(),
      });

      const res = await request(app)
        .patch(`/api/v1/tasks/${task._id}`)
        .send({ name: "Updated Task", completed: true })
        .expect(200);

      expect(res.body.task.name).toBe("Updated Task");
      expect(res.body.task.completed).toBe(true);
    });

    it("should return 404 when updating non-existent task", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .patch(`/api/v1/tasks/${fakeId}`)
        .send({ name: "Nothing" })
        .expect(404);

      expect(res.body.msg).toContain("No task found");
    });
  });

  describe("DELETE /api/v1/tasks/:id", () => {
    it("should delete a task", async () => {
      const task = await Task.create({
        name: "Delete Me",
        createdBy: new mongoose.Types.ObjectId(),
      });

      const res = await request(app)
        .delete(`/api/v1/tasks/${task._id}`)
        .expect(200);

      const found = await Task.findById(task._id);
      expect(found).toBeNull();
    });

    it("should return 404 when deleting non-existent task", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/v1/tasks/${fakeId}`)
        .expect(404);

      expect(res.body.msg).toContain("No task found");
    });
  });
});

describe("Project Controller", () => {
  let app;

  beforeEach(() => {
    app = createAppWithAuth(projectRoutes, "/api/v1/projects");
  });

  describe("POST /api/v1/projects", () => {
    it("should create a project", async () => {
      const res = await request(app)
        .post("/api/v1/projects")
        .send({
          name: "New Project",
          description: "Project description",
        })
        .expect(201);

      expect(res.body.project.name).toBe("New Project");
      expect(res.body.project.status).toBe("pending");
    });

    it("should return 400 when required fields are missing", async () => {
      const res = await request(app)
        .post("/api/v1/projects")
        .send({ name: "Missing Description" })
        .expect(400);
    });
  });

  describe("GET /api/v1/projects", () => {
    it("should return all projects", async () => {
      await Project.create([
        {
          name: "P1",
          description: "First",
          createdBy: new mongoose.Types.ObjectId(),
        },
        {
          name: "P2",
          description: "Second",
          createdBy: new mongoose.Types.ObjectId(),
        },
      ]);

      const res = await request(app).get("/api/v1/projects").expect(200);

      expect(res.body.projects.length).toBe(2);
    });
  });

  describe("GET /api/v1/projects/:id", () => {
    it("should return a project by id with populated fields", async () => {
      const userId = new mongoose.Types.ObjectId();
      const project = await Project.create({
        name: "Detailed Project",
        description: "With members",
        createdBy: userId,
        member: [{ users: userId, role: "admin" }],
      });

      const res = await request(app)
        .get(`/api/v1/projects/${project._id}`)
        .expect(200);

      expect(res.body.project.name).toBe("Detailed Project");
      expect(res.body.project.member.length).toBe(1);
    });

    it("should return 404 for non-existent project", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/v1/projects/${fakeId}`)
        .expect(404);
    });
  });

  describe("PATCH /api/v1/projects/:id", () => {
    it("should update a project", async () => {
      const project = await Project.create({
        name: "Old Project",
        description: "Old desc",
        createdBy: new mongoose.Types.ObjectId(),
      });

      const res = await request(app)
        .patch(`/api/v1/projects/${project._id}`)
        .send({ name: "Updated Project", status: "in-progress" })
        .expect(200);

      expect(res.body.project.name).toBe("Updated Project");
      expect(res.body.project.status).toBe("in-progress");
    });

    it("should return 404 for non-existent project", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .patch(`/api/v1/projects/${fakeId}`)
        .send({ name: "Nope" })
        .expect(404);
    });
  });

  describe("DELETE /api/v1/projects/:id", () => {
    it("should delete a project", async () => {
      const project = await Project.create({
        name: "To Delete",
        description: "Will be gone",
        createdBy: new mongoose.Types.ObjectId(),
      });

      const res = await request(app)
        .delete(`/api/v1/projects/${project._id}`)
        .expect(200);

      expect(res.body.msg).toBe("Project has been deleted successfully");

      const found = await Project.findById(project._id);
      expect(found).toBeNull();
    });

    it("should return 404 for non-existent project", async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .delete(`/api/v1/projects/${fakeId}`)
        .expect(404);
    });
  });
});

describe("Auth Controller", () => {
  let app;

  beforeEach(() => {
    app = createAppWithoutAuth(authRoutes, "/api/v1/auth");
  });

  describe("POST /api/v1/auth/register", () => {
    it("should register a new user and return tokens", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          name: "New User",
          email: "new@example.com",
          password: "password123",
        })
        .expect(201);

      expect(res.body.user.name).toBe("New User");
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it("should return 400 if email already exists", async () => {
      await User.create({
        name: "Existing",
        email: "dupe@example.com",
        password: "password123",
      });

      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          name: "Another",
          email: "dupe@example.com",
          password: "password123",
        })
        .expect(400);

      expect(res.body.msg).toBe("Email already exists");
    });

    it("should return 400 if fields are missing", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({ name: "No Email" })
        .expect(400);
    });

    it("should return 400 if password is too short", async () => {
      const res = await request(app)
        .post("/api/v1/auth/register")
        .send({
          name: "Short Pass",
          email: "short@example.com",
          password: "12345",
        })
        .expect(400);

      expect(res.body.msg).toContain("6 digits");
    });
  });

  describe("POST /api/v1/auth/login", () => {
    beforeEach(async () => {
      await User.create({
        name: "Login User",
        email: "login@example.com",
        password: "password123",
      });
    });

    it("should login with correct credentials", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "login@example.com", password: "password123" })
        .expect(200);

      expect(res.body.user.name).toBe("Login User");
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });

    it("should return 401 with wrong password", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "login@example.com", password: "wrongpass" })
        .expect(401);

      expect(res.body.msg).toBe("Invalid credentials");
    });

    it("should return 401 with non-existent email", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "nobody@example.com", password: "password123" })
        .expect(401);

      expect(res.body.msg).toBe("Invalid credentials");
    });

    it("should return 401 for OAuth-only account", async () => {
      await User.create({
        name: "GitHub Only",
        email: "oauth@example.com",
        githubId: "gh123",
      });

      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "oauth@example.com", password: "somepass" })
        .expect(401);

      expect(res.body.msg).toContain("GitHub");
    });

    it("should return 401 if email or password missing", async () => {
      const res = await request(app)
        .post("/api/v1/auth/login")
        .send({ email: "login@example.com" })
        .expect(401);
    });
  });

  describe("POST /api/v1/auth/refresh", () => {
    it("should return new access token with valid refresh token", async () => {
      const user = await User.create({
        name: "Refresh Test",
        email: "refresh-test@example.com",
        password: "password123",
      });

      const refreshToken = user.createRefreshToken();
      user.refreshToken = refreshToken;
      await user.save();

      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken })
        .expect(200);

      expect(res.body.accessToken).toBeDefined();
    });

    it("should return 401 with invalid refresh token", async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: "invalid-token" })
        .expect(401);
    });

    it("should return 401 if refresh token is missing", async () => {
      const res = await request(app)
        .post("/api/v1/auth/refresh")
        .send({})
        .expect(401);
    });
  });
});