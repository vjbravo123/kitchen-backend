import * as Joi from 'joi';

/**
 * Fails fast at boot time if required environment variables are missing.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(5000),
  API_PREFIX: Joi.string().default('api'),

  MONGODB_URI: Joi.string().required(),
  USE_TRANSACTIONS: Joi.boolean().truthy('true').falsy('false').default(true),

  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),

  RESEND_API_KEY: Joi.string().allow('').optional(),
  RESEND_FROM_EMAIL: Joi.string().allow('').optional(),

  OTP_EXPIRY_MINUTES: Joi.number().default(10),
  OTP_MAX_ATTEMPTS: Joi.number().default(5),
  OTP_RESEND_COOLDOWN_SECONDS: Joi.number().default(60),

  BCRYPT_SALT_ROUNDS: Joi.number().default(10),
});
