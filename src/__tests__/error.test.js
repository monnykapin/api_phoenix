const { CustomAPIError, createCustomError } = require("../error/custom-error");
const BadRequestError = require("../error/bad-request");
const NotFoundError = require("../error/not-found");
const UnauthenticatedError = require("../error/unauthenticated");

describe("Error Classes", () => {
  describe("CustomAPIError", () => {
    it("should create an error with message and status code", () => {
      const err = new CustomAPIError("test message", 400);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe("test message");
      expect(err.statusCode).toBe(400);
    });
  });

  describe("createCustomError", () => {
    it("should return a CustomAPIError instance", () => {
      const err = createCustomError("not found", 404);
      expect(err).toBeInstanceOf(CustomAPIError);
      expect(err.message).toBe("not found");
      expect(err.statusCode).toBe(404);
    });
  });

  describe("BadRequestError", () => {
    it("should set status code to 400", () => {
      const err = new BadRequestError("bad input");
      expect(err.statusCode).toBe(400);
      expect(err.message).toBe("bad input");
    });
  });

  describe("NotFoundError", () => {
    it("should set status code to 404", () => {
      const err = new NotFoundError("missing");
      expect(err.statusCode).toBe(404);
      expect(err.message).toBe("missing");
    });
  });

  describe("UnauthenticatedError", () => {
    it("should set status code to 401", () => {
      const err = new UnauthenticatedError("no access");
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe("no access");
    });
  });
});