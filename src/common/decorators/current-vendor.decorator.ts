import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface VendorContext {
  vendorId: string;
  email: string;
  name: string;
}

/**
 * Injects the authenticated vendor (populated by JwtStrategy.validate).
 * `@CurrentVendor('vendorId')` returns just the id.
 */
export const CurrentVendor = createParamDecorator(
  (data: keyof VendorContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const vendor: VendorContext = request.user;
    return data ? vendor?.[data] : vendor;
  },
);
