import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { VendorsService } from '../../vendors/vendors.service';
import { VendorContext } from '../../common/decorators/current-vendor.decorator';

export interface JwtPayload {
  sub: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly vendorsService: VendorsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('jwt.secret'),
    });
  }

  /** Re-checks the vendor on every request so deactivated accounts lose access immediately. */
  async validate(payload: JwtPayload): Promise<VendorContext> {
    const vendor = await this.vendorsService.findByIdRaw(payload.sub);
    if (!vendor || !vendor.isActive) {
      throw new UnauthorizedException('Vendor account is not active');
    }
    if (!vendor.isEmailVerified) {
      throw new UnauthorizedException('Email is not verified');
    }
    return { vendorId: vendor._id.toString(), email: vendor.email, name: vendor.name };
  }
}
