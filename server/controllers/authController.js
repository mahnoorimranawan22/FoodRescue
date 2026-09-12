/**
 * /api/auth controller — register, login, session profile.
 *
 * Security notes:
 *   • Passwords hashed with bcryptjs (cost 12) by the User model's pre-save
 *     hook; `password` is select:false so it never leaves the DB by accident.
 *   • Login responses are generic ("Invalid email or password") whether the
 *     email or the password was wrong — no account enumeration.
 *   • JWT payload: { sub: user.id, role, email } — id, role and name travel
 *     with every request; name is re-read from the live user doc in protect().
 *   • Input validation happens before any DB work; duplicate emails surface
 *     as 409 whether caught pre-flight or by the unique index (code 11000).
 */
const User = require("../models/User");
const { signToken } = require("../utils/jwt");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Shape a user for API responses — never include the password hash. */
function publicUser(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationType: user.organizationType,
    isVerified: user.isVerified,
  };
}

/**
 * POST /api/auth/register
 * Body: { name, email, password, role?, organizationType?, phone?, location? }
 * → 201 { token, user }
 */
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, organizationType, phone, location } =
      req.body || {};

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "name, email and password are required" });
    }
    if (typeof password !== "string" || password.length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    }
    if (!EMAIL_RE.test(String(email))) {
      return res.status(400).json({ message: "Please provide a valid email" });
    }

    const existing = await User.findOne({ email: String(email).toLowerCase() });
    if (existing) {
      return res
        .status(409)
        .json({ message: "An account with that email already exists" });
    }

    // Omit empty keys — passing `location: undefined` would still mark the
    // subdocument as present and trip its conditional required validators.
    const user = await User.create({
      name,
      email,
      password,
      role: role || "recipient",
      ...(organizationType ? { organizationType } : {}),
      ...(phone ? { phone } : {}),
      ...(location ? { location } : {}),
    });

    return res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res
        .status(409)
        .json({ message: "An account with that email already exists" });
    }
    if (err.name === "ValidationError") {
      return res
        .status(400)
        .json({ message: Object.values(err.errors)[0].message });
    }
    return next(err);
  }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 * → 200 { token, user }
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }
    // password has select:false — request it explicitly here
    const user = await User.findOne({
      email: String(email).toLowerCase(),
    }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    return next(err);
  }
};

/**
 * GET /api/auth/me — protected profile of the logged-in user.
 * (protect() has already verified the token and loaded req.user)
 */
exports.me = (req, res) => {
  res.json({ user: publicUser(req.user) });
};
