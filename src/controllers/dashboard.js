const asyncWrapper = require("../middleware/async");
const Task = require("../models/Task");
const User = require("../models/User");
const Project = require("../models/Project");
const { createCustomError } = require("../error/custom-error");

const getDashboard = asyncWrapper(async (req, res, next) => {
  const userId = req.user.userId;
  const userInfo = await User.findById(userId).select("-password");
  if (!userInfo) {
    return next(createCustomError("User not found", 404));
  }
  //Get user's tasks, stats, etc.
  const totalTasks = await Task.countDocuments({ createdBy: userId });
  const completedTasks = await Task.countDocuments({
    createdBy: userId,
    completed: true,
  });
  const pendingTasks = await Task.countDocuments({
    createdBy: userId,
    completed: false,
  });

  const recentTasks = await Task.find({ createdBy: userId })
    .sort({ createdAt: -1 })
    .limit(5);

  const totalProjects = await Project.countDocuments({ createdBy: userId });
  const recentProjects = await Project.find({ createdBy: userId })
    .sort({ createdAt: -1 })
    .limit(5);

  res.status(200).json({
    userInfo,
    totalTasks,
    completedTasks,
    pendingTasks,
    recentTasks,
    totalProjects,
    recentProjects,
  });
});

module.exports = {
  getDashboard,
};
