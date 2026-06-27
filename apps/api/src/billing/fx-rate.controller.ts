import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FxRateService } from './fx-rate.service';
import { FxRateQueryDto } from './dto/fx-rate.dto';
import { AccessPolicyGuard } from '../access-policy.guard';
import { RequireAccessPolicy } from '../access-policy.decorator';

@Controller('billing/fx-rates')
@UseGuards(AccessPolicyGuard)
export class FxRateController {
  constructor(private readonly fxRateService: FxRateService) {}

  @Get('rates')
  @HttpCode(HttpStatus.OK)
  @RequireAccessPolicy({ minimumRole: 'MEMBER' })
  async getRate(@Query() query: FxRateQueryDto, @Req() req: any) {
    const { baseCurrency, targetCurrency } = query;
    const amount = query.amount ? Number(query.amount) : undefined;
    const tenantId = req.user?.tenantId || 'playground';

    if (!baseCurrency || !targetCurrency) {
      throw new BadRequestException('Both baseCurrency and targetCurrency are required.');
    }

    if (amount !== undefined && !Number.isNaN(amount) && amount > 0) {
      return this.fxRateService.estimateCost({
        baseCurrency,
        targetCurrency,
        amount,
        tenantId,
      });
    }

    return this.fxRateService.getExchangeRate(baseCurrency, targetCurrency, tenantId);
  }

  @Get('rates/all')
  @HttpCode(HttpStatus.OK)
  @RequireAccessPolicy({ minimumRole: 'MEMBER' })
  async listAllRates(@Req() req: any) {
    const tenantId = req.user?.tenantId || 'playground';
    return this.fxRateService.listRates(tenantId);
  }
}
