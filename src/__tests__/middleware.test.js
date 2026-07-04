const asyncWrapper = require("../middleware/async");
const auth = require("../middleware/authentication");
const errorHandlerMiddleware = require("../middleware/error-handler");
const notFound = require("../middleware/not-found");
const { createCustomError } = require("../error/custom-error");
const jwt = require("jsonwebtoken");

describe("asyncWrapper Middleware", () => {
  it("should call the wrapped function with req, res, next", async () => {
    const mockFn = jest.fn().mockResolvedValue("success");
    const wrapped = asyncWrapper(mockFn);
    const req = {};
    const res = {};
    const next = jest.fn();

    await wrapped(req, res, next);
    expect(mockFn).toHaveBeenCalledWith(req, res, next);
  });

  it("should call next with error when wrapped function throws", async () => {
    const error = new Error("test error");
    const mockFn = jest.fn().mockRejectedValue(error);
    const wrapped = asyncWrapper(mockFn);
    const req = {};
    const res = {};
    const next = jest.fn();

    await wrapped(req, res, next);
    expect(next).toHaveBeenCalledWith(error);
  });

  it("should not call next when function succeeds", async () => {
    const mockFn = jest.fn().mockResolvedValue("success");
    const wrapped = asyncWrapper(mockFn);
    const req = {};
    const res = {};
    const next = jest.fn();

    await wrapped(req, res, next);
    expect(next).not.toHaveBeenCalled();
  });
});

describe("authentication Middleware", () => {
  beforeAll(() => {
    process.env.JWT_SECRET = "test-secret-for-jest-auth";
  });

  it("should return 401 if no authorization header", () => {
    const req = { headers: {} };
    const res = {};
    const next = jest.fn();

    auth(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Authentication is invalid",
        statusCode: 401,
      })
    );
  });

  it("should return 401 if authorization header does not start with Bearer", () => {
    const req = { headers: { authorization: "Basic abc123" } };
    const res = {};
    const next = jest.fn();

    auth(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Authentication is invalid",
        statusCode: 401,
      })
    );
  });

  it("should return 401 for invalid token", () => {
    const req = { headers: { authorization: "Bearer invalid.token.here" } };
    const res = {};
    const next = jest.fn();

    auth(req, res, next);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Authentication is invalid",
        statusCode: 401,
      })
    );
  });

  it("should set req.user and call next for valid token", () => {
    const token = jwt.sign(
      { userId: "user123", name: "Test User" },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    const req = { headers: { authorization: `Bearer ${token}` } };
    const res = {};
    const next = jest.fn();

    auth(req, res, next);
    expect(req.user).toEqual({ userId: "user123", name: "Test User" });
    expect(next).toHaveBeenCalledWith();
  });
});

describe("errorHandler Middleware", () => {
  it("should return custom error message and status code", () => {
    const err = createCustomError("Custom error", 403);
    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandlerMiddleware(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ msg: "Custom error" });
  });

  it("should handle mongoose validation errors", () => {
    const err = new Error("Validation failed");
    err.name = "ValidationError";
    err.errors = {
      name: { message: "Name is required" },
      email: { message: "Email is invalid" },
    };

    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandlerMiddleware(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      msg: "Name is required,Email is invalid",
    });
  });

  it("should handle duplicate key errors", () => {
    const err = new Error("Duplicate");
    err.code = 11000;
    err.keyValue = { email: "test@test.com" };

    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandlerMiddleware(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      msg: "Duplicate value entered for email field, please choose another value",
    });
  });

  it("should handle cast errors", () => {
    const err = new Error("Cast error");
    err.name = "CastError";
    err.value = "invalid-id";

    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandlerMiddleware(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      msg: "No item found with id : invalid-id",
    });
  });

  it("should default to 500 for unknown errors", () => {
    const err = new Error("Something exploded");
    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    const next = jest.fn();

    errorHandlerMiddleware(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ msg: "Something exploded" });
  });
});

describe("notFound Middleware", () => {
  it("should return 404 with route does not exist message", () => {
    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    notFound(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.send).toHaveBeenCalledWith("Route does not exist.");
  });
});