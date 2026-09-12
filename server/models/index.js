/**
 * FoodRescue — model barrel
 * `const { User, FoodListing, Claim } = require("../models");`
 */
const User = require("./User");
const FoodListing = require("./FoodListing");
const Claim = require("./Claim");

module.exports = { User, FoodListing, Claim };
