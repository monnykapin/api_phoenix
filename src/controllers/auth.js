const User = require("../../src/models/User");
const { StatusCodes } = require("http-status-codes");
const asyncWrapper = require("../middleware/async");
const { createCustomError } = require("../../src/error/custom-error");
const jwt = require("jsonwebtoken");

const isEmailExists = async (email) => {
  return await User.exists({ email });
};

const register = asyncWrapper(async (req, res, next) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return next(
      createCustomError("Please provide name, email and password", 400)
    );
  }
  if (password.length < 6) {
    return next(createCustomError("Please provide 6 digits password", 400));
  }

  // Check if the email already exists
  const emailExists = await isEmailExists(email);
  if (emailExists) {
    return next(createCustomError("Email already exists", 400));
  }

  const user = await User.create({ ...req.body });
  const accessToken = user.createJWT();
  const refreshToken = user.createRefreshToken();

  // Save refresh token to database
  await saveRefreshToken(user._id, refreshToken);

  res.status(StatusCodes.CREATED).json({
    user: { name: user.name },
    accessToken,
    refreshToken,
  });
});

const login = asyncWrapper(async (req, res, next) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return next(createCustomError("Please provide email and password", 401));
  }
  const user = await User.findOne({ email });
  if (!user) {
    return next(createCustomError("Invalid credentials", 401));
  }

  // Check if user has a password (not OAuth-only account)
  if (!user.password) {
    return next(
      createCustomError(
        "This account uses GitHub login. Please sign in with GitHub",
        401
      )
    );
  }

  const isPasswordCorrect = await user.comparePassword(password);
  if (!isPasswordCorrect) {
    return next(createCustomError("Invalid credentials", 401));
  }

  const accessToken = user.createJWT();
  const refreshToken = user.createRefreshToken();

  // Save refresh token to database
  await saveRefreshToken(user._id, refreshToken);

  res.status(StatusCodes.OK).json({
    user: { name: user.name },
    accessToken,
    refreshToken,
  });
});

/**
 * Save refresh token to user
 * @param {string} userId - User ID
 * @param {string} refreshToken - Refresh token
 */
const saveRefreshToken = async (userId, refreshToken) => {
  await User.findByIdAndUpdate(userId, { refreshToken });
};

/**
 * Verify refresh token
 * @param {string} token - Refresh token
 * @returns {Promise<Object>} Decoded token payload
 */
const verifyRefreshToken = async (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
};

/**
 * Revoke refresh token
 * @param {string} userId - User ID
 */
const revokeRefreshToken = async (userId) => {
  await User.findByIdAndUpdate(userId, { refreshToken: null });
};

const githubCallback = async (req, res) => {
  // User is authenticated via passport
  const user = req.user;

  // Generate JWT tokens
  const accessToken = user.createJWT();
  const refreshToken = user.createRefreshToken();

  // Save refresh token to database
  await saveRefreshToken(user._id, refreshToken);

  // Return JSON response with user and tokens
  res.status(StatusCodes.OK).json({
    user: { name: user.name, email: user.email },
    accessToken,
    refreshToken,
  });
};

const refreshAccessToken = asyncWrapper(async (req, res, next) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return next(createCustomError("Refresh token is required", 401));
  }

  try {
    // Verify refresh token
    const decoded = await verifyRefreshToken(refreshToken);

    // Find user and check if refresh token matches
    const user = await User.findById(decoded.userId);
    if (!user || user.refreshToken !== refreshToken) {
      return next(createCustomError("Invalid refresh token", 401));
    }

    // Generate new access token
    const newAccessToken = user.createJWT();

    res.status(StatusCodes.OK).json({
      accessToken: newAccessToken,
    });
  } catch (error) {
    return next(createCustomError("Invalid or expired refresh token", 401));
  }
});

const logout = asyncWrapper(async (req, res) => {
  const userId = req.user.userId;
  await revokeRefreshToken(userId);
  res.status(StatusCodes.OK).json({ message: "Logged out successfully" });
});

module.exports = {
  register,
  login,
  githubCallback,
  saveRefreshToken,
  verifyRefreshToken,
  refreshAccessToken,
  logout,
};
