const express = require("express");
const router = express.Router();
const passport = require("../config/passport");
const authentication = require("../middleware/authentication");

const {
  register,
  login,
  githubCallback,
  refreshAccessToken,
  logout,
} = require("../controllers/auth");

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refreshAccessToken); // New route
router.post("/logout", authentication, logout); // New route (requires auth)

// GitHub OAuth routes
router.get(
  "/github",
  passport.authenticate("github", { scope: ["user:email"] })
);
router.get(
  "/github/callback",
  passport.authenticate("github", {
    session: false,
    failureRedirect: "/api/v1/auth/login",
  }),
  githubCallback
);

module.exports = router;
