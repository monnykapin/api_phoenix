const User = require("../models/User");
const { StatusCodes } = require("http-status-codes");
const asyncWrapper = require("../middleware/async");
const { createCustomError } = require("../error/custom-error");

const getProfile = asyncWrapper(async (req, res, next) => {
  const userId = req.user.userId;
  const user = await User.findById(userId).select("-password");
  if (!user) {
    return next(createCustomError("User not found", 404));
  }
  res.status(StatusCodes.OK).json({ user });
});

const updateProfile = asyncWrapper(async (req, res, next) => {
  const userId = req.user.userId;
  const { name, email, avatar } = req.body;

  const updateData = {};
  if (name && name.trim()) updateData.name = name.trim();
  if (email && email.trim()) updateData.email = email.trim();
  if (avatar && avatar.trim()) updateData.avatar = avatar.trim();

  if (email && email.trim()) {
    const existingUser = await User.findOne({
      email: email.trim(),
      _id: { $ne: userId },
    });
    if (existingUser) {
      return next(createCustomError("Email already in use", 400));
    }
  }

  const user = await User.findByIdAndUpdate(userId, updateData, {
    new: true,
    runValidators: true,
  }).select("-password");

  if (!user) {
    return next(createCustomError("User not found", 404));
  }

  res.status(StatusCodes.OK).json({ user });
});

module.exports = { getProfile, updateProfile };
