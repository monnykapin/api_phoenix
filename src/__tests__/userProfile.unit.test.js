const User = require("../models/User");
const { getProfile, updateProfile } = require("../controllers/profile");
const { StatusCodes } = require("http-status-codes");

describe("User Model Schema - Role & Preferences", () => {
  it("should set default role to 'normal' and default theme to 'system'", () => {
    const user = new User({
      name: "Default User",
      email: "default@example.com",
      password: "password123",
    });

    const error = user.validateSync();
    expect(error).toBeUndefined();
    expect(user.role).toBe("normal");
    expect(user.preferences.theme).toBe("system");
  });

  it("should accept role 'Admin' and theme 'dark' or 'light'", () => {
    const adminDark = new User({
      name: "Admin Dark",
      email: "admin@example.com",
      password: "password123",
      role: "Admin",
      preferences: { theme: "dark" },
    });

    const errorDark = adminDark.validateSync();
    expect(errorDark).toBeUndefined();
    expect(adminDark.role).toBe("Admin");
    expect(adminDark.preferences.theme).toBe("dark");

    const normalLight = new User({
      name: "Normal Light",
      email: "light@example.com",
      password: "password123",
      role: "normal",
      preferences: { theme: "light" },
    });

    const errorLight = normalLight.validateSync();
    expect(errorLight).toBeUndefined();
    expect(normalLight.role).toBe("normal");
    expect(normalLight.preferences.theme).toBe("light");
  });

  it("should reject invalid role values", () => {
    const invalidUser = new User({
      name: "Invalid Role",
      email: "invalid@example.com",
      password: "password123",
      role: "superuser",
    });

    const error = invalidUser.validateSync();
    expect(error).toBeDefined();
    expect(error.errors.role.message).toMatch(/is not a valid role/);
  });

  it("should reject invalid theme preference values", () => {
    const invalidUser = new User({
      name: "Invalid Theme",
      email: "invalid@example.com",
      password: "password123",
      preferences: { theme: "solarized" },
    });

    const error = invalidUser.validateSync();
    expect(error).toBeDefined();
    expect(error.errors["preferences.theme"].message).toMatch(
      /is not a valid theme/
    );
  });
});

describe("Profile Controller", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("getProfile", () => {
    it("should return user profile including role and preferences", async () => {
      const mockUser = {
        _id: "user123",
        name: "Test User",
        email: "test@example.com",
        role: "Admin",
        preferences: { theme: "dark" },
        balance: 0,
      };

      const selectMock = jest.fn().mockResolvedValue(mockUser);
      jest.spyOn(User, "findById").mockReturnValue({ select: selectMock });

      const req = { user: { userId: "user123" } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await getProfile(req, res, next);

      expect(User.findById).toHaveBeenCalledWith("user123");
      expect(selectMock).toHaveBeenCalledWith("-password");
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ user: mockUser });
      expect(res.json.mock.calls[0][0].user.role).toBe("Admin");
      expect(res.json.mock.calls[0][0].user.preferences.theme).toBe("dark");
    });

    it("should call next with 404 if user not found", async () => {
      const selectMock = jest.fn().mockResolvedValue(null);
      jest.spyOn(User, "findById").mockReturnValue({ select: selectMock });

      const req = { user: { userId: "notfound" } };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await getProfile(req, res, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "User not found",
          statusCode: 404,
        })
      );
    });
  });

  describe("updateProfile", () => {
    it("should update preferences via req.body.preferences", async () => {
      const updatedUser = {
        _id: "user123",
        name: "Test User",
        email: "test@example.com",
        role: "normal",
        preferences: { theme: "dark" },
      };

      const selectMock = jest.fn().mockResolvedValue(updatedUser);
      jest.spyOn(User, "findByIdAndUpdate").mockReturnValue({ select: selectMock });

      const req = {
        user: { userId: "user123" },
        body: {
          preferences: { theme: "dark" },
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await updateProfile(req, res, next);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        "user123",
        { "preferences.theme": "dark" },
        { new: true, runValidators: true }
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ user: updatedUser });
    });

    it("should update preferences via req.body.theme shorthand", async () => {
      const updatedUser = {
        _id: "user123",
        name: "Test User",
        email: "test@example.com",
        role: "normal",
        preferences: { theme: "light" },
      };

      const selectMock = jest.fn().mockResolvedValue(updatedUser);
      jest.spyOn(User, "findByIdAndUpdate").mockReturnValue({ select: selectMock });

      const req = {
        user: { userId: "user123" },
        body: {
          theme: "light",
        },
      };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      await updateProfile(req, res, next);

      expect(User.findByIdAndUpdate).toHaveBeenCalledWith(
        "user123",
        { "preferences.theme": "light" },
        { new: true, runValidators: true }
      );
      expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
      expect(res.json).toHaveBeenCalledWith({ user: updatedUser });
    });
  });
});
