const Joi = require("joi");

const agentSignupSchema = Joi.object({
  fullName: Joi.string().required(),
  email: Joi.string().email().required(),
  teamName:Joi.string().optional(),
  password: Joi.string().min(8).required(),
  phoneNumber:Joi.string().optional(),
});


const verifyEmailSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).required()
});

const resendOTPSchema = Joi.object({
  email: Joi.string().email().required()
});


const clientSignupSchema = Joi.object({
  companyName: Joi.string().required(),
  email: Joi.string().email().required(),
  uploaderName: Joi.string().required(),
  uploaderPhone: Joi.string().required(),
  password: Joi.string().min(6).required()
});

const adminSignupSchema = Joi.object({
  fullName:Joi.string().required(),
  email: Joi.string().email().required(),
  phoneNumber:Joi.string().required(),
  securityQuestion:Joi.string().required(),
  password: Joi.string().min(6).required(),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().email().required()
});

const verifyResetOTPSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).required()
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().required(),
  otp: Joi.string().length(6).required(),
  newPassword: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
});


const updateAgentProfileSchema = Joi.object({
  address: Joi.string().optional(),
  phoneNumber: Joi.string().optional(),
});

const updateClientProfileSchema = Joi.object({
  companyName: Joi.string().optional(),
  uploaderName: Joi.string().optional(),
  uploaderPhone: Joi.string().optional()
});

const createTaskSchema = Joi.object({
  customerName: Joi.string().required(),
  verificationAddress: Joi.string().required()
});

const submitTaskSchema = Joi.object({
  addressExistence: Joi.string().valid("Yes", "No").required(),
  addressResidential: Joi.string().valid("Yes", "No").required(),
  customerResident: Joi.string().valid("Yes", "No").required(),
  customerKnown: Joi.string().valid("Yes", "No").required(),
  metWith: Joi.string().required(),
  nameOfPersonMet: Joi.string().required(),
  easeOfLocation: Joi.string().required(),
  comments: Joi.string().allow(""),
  additionalComments: Joi.string().allow(""),
  receivedDate: Joi.date().required(),
  personMetOthers: Joi.string().allow(""),
  relatioshipWithCustomer: Joi.string().allow(""),
  customerRelationshipWithAddress: Joi.string().allow(""),
  buildingColor: Joi.string().allow(""),
  buildingType: Joi.string().allow(""),
  areaProfile: Joi.string().allow(""),
  landMark: Joi.string().allow(""),
  visitFeedback: Joi.string().required(),
  lat: Joi.number().required(),
  lng: Joi.number().required(),
  visitDate: Joi.date().required()
});





module.exports = {
  agentSignupSchema,
  clientSignupSchema,
  adminSignupSchema,

  verifyEmailSchema,
  resendOTPSchema,
  forgotPasswordSchema,
  verifyResetOTPSchema,
  resetPasswordSchema,
  loginSchema,
  updateAgentProfileSchema,
  updateClientProfileSchema,
  
  createTaskSchema,
  submitTaskSchema
};
