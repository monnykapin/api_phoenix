const mongoose = require("mongoose");
const Guest = require("../models/Guest");
const User = require("../models/User");
const Task = require("../models/Task");
const Project = require("../models/Project");
const Transaction = require("../models/Transaction");
const Asset = require("../models/Asset");
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

describe("Guest Model", () => {
  it("should create a guest with valid fields", async () => {
    const guest = await Guest.create({
      guestName: "John Doe",
      guestLocation: "Phnom Penh",
      amount: 100,
      currency: "USD",
      createdBy: new mongoose.Types.ObjectId(),
    });

    expect(guest.guestName).toBe("John Doe");
    expect(guest.guestLocation).toBe("Phnom Penh");
    expect(guest.status).toBe("outgoing");
    expect(guest.amount).toBe(100);
    expect(guest.currency).toBe("USD");
    expect(guest.createdAt).toBeDefined();
    expect(guest.updatedAt).toBeDefined();
  });

  it("should default status to outgoing", async () => {
    const guest = await Guest.create({
      guestName: "Jane",
      guestLocation: "Siem Reap",
      createdBy: new mongoose.Types.ObjectId(),
    });

    expect(guest.status).toBe("outgoing");
  });

  it("should default amount to 0", async () => {
    const guest = await Guest.create({
      guestName: "Jane",
      guestLocation: "Siem Reap",
      createdBy: new mongoose.Types.ObjectId(),
    });

    expect(guest.amount).toBe(0);
  });

  it("should default currency to USD", async () => {
    const guest = await Guest.create({
      guestName: "Jane",
      guestLocation: "Siem Reap",
      createdBy: new mongoose.Types.ObjectId(),
    });

    expect(guest.currency).toBe("USD");
  });

  it("should require guestName", async () => {
    await expect(
      Guest.create({
        guestLocation: "Phnom Penh",
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow(/guest name/);
  });

  it("should require guestLocation", async () => {
    await expect(
      Guest.create({
        guestName: "John",
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow(/guest location/);
  });

  it("should require createdBy", async () => {
    await expect(
      Guest.create({
        guestName: "John",
        guestLocation: "PP",
      }),
    ).rejects.toThrow(/user/);
  });

  it("should only allow valid status enum values", async () => {
    await expect(
      Guest.create({
        guestName: "John",
        guestLocation: "PP",
        status: "invalid-status",
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow();
  });

  it("should enforce maxlength on guestName", async () => {
    await expect(
      Guest.create({
        guestName: "A".repeat(121),
        guestLocation: "PP",
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow(/120/);
  });

  it("should enforce maxlength on guestLocation", async () => {
    await expect(
      Guest.create({
        guestName: "John",
        guestLocation: "A".repeat(121),
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow(/120/);
  });
});

describe("User Model", () => {
  it("should create a user with valid fields", async () => {
    const user = await User.create({
      name: "Test User",
      email: "test@example.com",
      password: "password123",
    });

    expect(user.name).toBe("Test User");
    expect(user.email).toBe("test@example.com");
    expect(user.balance).toBe(0);
  });

  it("should hash password on save", async () => {
    const user = await User.create({
      name: "Test",
      email: "hash@example.com",
      password: "mypassword",
    });

    expect(user.password).not.toBe("mypassword");
    expect(user.password.startsWith("$2")).toBe(true);
  });

  it("should not re-hash unchanged password", async () => {
    const user = await User.create({
      name: "Test",
      email: "rehash@example.com",
      password: "mypassword",
    });

    const hashAfterCreate = user.password;
    user.name = "Updated";
    await user.save();

    expect(user.password).toBe(hashAfterCreate);
  });

  it("should allow passwordless user (OAuth)", async () => {
    const user = await User.create({
      name: "GitHub User",
      email: "github@example.com",
      githubId: "12345",
    });

    expect(user.password).toBeUndefined();
    expect(user.githubId).toBe("12345");
  });

  it("should compare passwords correctly", async () => {
    const user = await User.create({
      name: "Test",
      email: "compare@example.com",
      password: "mypassword",
    });

    const isMatch = await user.comparePassword("mypassword");
    expect(isMatch).toBe(true);

    const isNotMatch = await user.comparePassword("wrongpassword");
    expect(isNotMatch).toBe(false);
  });

  it("should create JWT token", async () => {
    const user = await User.create({
      name: "Test",
      email: "jwt@example.com",
      password: "mypassword",
    });

    process.env.JWT_SECRET = "test-secret-for-jest";
    process.env.JWT_LIFETIME = "1h";

    const token = user.createJWT();
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);
  });

  it("should create refresh token", async () => {
    const user = await User.create({
      name: "Test",
      email: "refresh@example.com",
      password: "mypassword",
    });

    process.env.REFRESH_TOKEN_SECRET = "refresh-secret-for-jest";
    process.env.REFRESH_TOKEN_LIFETIME = "7d";

    const token = user.createRefreshToken();
    expect(typeof token).toBe("string");
    expect(token.split(".").length).toBe(3);
  });

  it("should require valid email format", async () => {
    await expect(
      User.create({
        name: "Test",
        email: "not-an-email",
        password: "password123",
      }),
    ).rejects.toThrow();
  });

  it("should enforce unique email", async () => {
    await User.create({
      name: "First",
      email: "dupe@example.com",
      password: "password123",
    });

    await expect(
      User.create({
        name: "Second",
        email: "dupe@example.com",
        password: "password123",
      }),
    ).rejects.toThrow();
  });

  it("should enforce min password length", async () => {
    await expect(
      User.create({
        name: "Test",
        email: "short@example.com",
        password: "12345",
      }),
    ).rejects.toThrow();
  });

  it("should default balance to 0", async () => {
    const user = await User.create({
      name: "Test",
      email: "balance@example.com",
      password: "password123",
    });
    expect(user.balance).toBe(0);
  });

  it("should enforce min balance of 0", async () => {
    await expect(
      User.create({
        name: "Test",
        email: "neg@example.com",
        password: "password123",
        balance: -1,
      }),
    ).rejects.toThrow();
  });
});

describe("Task Model", () => {
  it("should create a task with valid fields", async () => {
    const task = await Task.create({
      name: "Test Task",
      description: "Test Description",
      createdBy: new mongoose.Types.ObjectId(),
    });

    expect(task.name).toBe("Test Task");
    expect(task.description).toBe("Test Description");
    expect(task.completed).toBe(false);
    expect(task.status).toBe("pending");
    expect(task.dueDate).toBeNull();
  });

  it("should default description", async () => {
    const task = await Task.create({
      name: "Minimal Task",
      createdBy: new mongoose.Types.ObjectId(),
    });

    expect(task.description).toBe("Description");
  });

  it("should enforce name maxlength", async () => {
    await expect(
      Task.create({
        name: "A".repeat(121),
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow(/120/);
  });

  it("should enforce description maxlength", async () => {
    await expect(
      Task.create({
        name: "Task",
        description: "A".repeat(251),
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow(/250/);
  });

  it("should only allow valid status enum values", async () => {
    await expect(
      Task.create({
        name: "Task",
        status: "invalid",
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow();
  });

  it("should allow null dueDate", async () => {
    const task = await Task.create({
      name: "Task",
      dueDate: null,
      createdBy: new mongoose.Types.ObjectId(),
    });
    expect(task.dueDate).toBeNull();
  });
});

describe("Project Model", () => {
  it("should create a project with valid fields", async () => {
    const project = await Project.create({
      name: "Test Project",
      description: "A test project",
      createdBy: new mongoose.Types.ObjectId(),
    });

    expect(project.name).toBe("Test Project");
    expect(project.description).toBe("A test project");
    expect(project.status).toBe("pending");
  });

  it("should default status to pending", async () => {
    const project = await Project.create({
      name: "Project",
      description: "Desc",
      createdBy: new mongoose.Types.ObjectId(),
    });

    expect(project.status).toBe("pending");
  });

  it("should require name", async () => {
    await expect(
      Project.create({
        description: "Missing name",
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow();
  });

  it("should require description", async () => {
    await expect(
      Project.create({
        name: "Missing Description",
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow();
  });

  it("should allow scope array", async () => {
    const project = await Project.create({
      name: "Scoped",
      description: "Has scope",
      scope: ["feature1", "feature2"],
      createdBy: new mongoose.Types.ObjectId(),
    });

    expect(project.scope).toEqual(["feature1", "feature2"]);
  });

  it("should allow members with roles", async () => {
    const project = await Project.create({
      name: "With Members",
      description: "Has members",
      createdBy: new mongoose.Types.ObjectId(),
      member: [
        {
          users: new mongoose.Types.ObjectId(),
          role: "developer",
        },
      ],
    });

    expect(project.member.length).toBe(1);
    expect(project.member[0].role).toBe("developer");
  });

  it("should set default member role to viewer", async () => {
    const project = await Project.create({
      name: "Default Role",
      description: "Default member role test",
      createdBy: new mongoose.Types.ObjectId(),
      member: [
        {
          users: new mongoose.Types.ObjectId(),
        },
      ],
    });

    expect(project.member[0].role).toBe("viewer");
  });

  it("should only allow valid status enum values", async () => {
    await expect(
      Project.create({
        name: "Bad Status",
        description: "Invalid status",
        status: "unknown",
        createdBy: new mongoose.Types.ObjectId(),
      }),
    ).rejects.toThrow();
  });
});

describe("Transaction Model", () => {
  it("should create a transaction with valid fields", async () => {
    const txn = await Transaction.create({
      userId: new mongoose.Types.ObjectId(),
      type: "income",
      amount: 500,
      description: "Salary",
    });

    expect(txn.type).toBe("income");
    expect(txn.amount).toBe(500);
    expect(txn.description).toBe("Salary");
    expect(txn.date).toBeDefined();
  });

  it("should require userId", async () => {
    await expect(
      Transaction.create({
        type: "expense",
        amount: 100,
        description: "Food",
      }),
    ).rejects.toThrow();
  });

  it("should require type", async () => {
    await expect(
      Transaction.create({
        userId: new mongoose.Types.ObjectId(),
        amount: 100,
        description: "Food",
      }),
    ).rejects.toThrow();
  });

  it("should require amount", async () => {
    await expect(
      Transaction.create({
        userId: new mongoose.Types.ObjectId(),
        type: "expense",
        description: "Food",
      }),
    ).rejects.toThrow();
  });

  it("should require description", async () => {
    await expect(
      Transaction.create({
        userId: new mongoose.Types.ObjectId(),
        type: "expense",
        amount: 100,
      }),
    ).rejects.toThrow();
  });

  it("should enforce min amount of 0", async () => {
    await expect(
      Transaction.create({
        userId: new mongoose.Types.ObjectId(),
        type: "expense",
        amount: -50,
        description: "Negative",
      }),
    ).rejects.toThrow();
  });

  it("should only allow valid type enum values", async () => {
    await expect(
      Transaction.create({
        userId: new mongoose.Types.ObjectId(),
        type: "invalid",
        amount: 100,
        description: "Bad type",
      }),
    ).rejects.toThrow();
  });

  it("should default date to now", async () => {
    const before = new Date();
    const txn = await Transaction.create({
      userId: new mongoose.Types.ObjectId(),
      type: "income",
      amount: 100,
      description: "Date test",
    });
    const after = new Date();

    expect(txn.date.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(txn.date.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });
});

describe("Asset Model", () => {
  it("should create an asset with valid fields", async () => {
    const asset = await Asset.create({
      name: "Laptop",
      type: "electronics",
      description: "Work laptop",
    });

    expect(asset.name).toBe("Laptop");
    expect(asset.type).toBe("electronics");
    expect(asset.description).toBe("Work laptop");
    expect(asset.condition).toBe(10);
    expect(asset.image).toBeNull();
  });

  it("should default type to null", async () => {
    const asset = await Asset.create({
      name: "Desk",
    });
    expect(asset.type).toBeNull();
  });

  it("should default description to empty string", async () => {
    const asset = await Asset.create({
      name: "Chair",
    });
    expect(asset.description).toBe("");
  });

  it("should default condition to 10", async () => {
    const asset = await Asset.create({
      name: "Monitor",
    });
    expect(asset.condition).toBe(10);
  });
});
