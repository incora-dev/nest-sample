import {
  Get,
  Post,
  Controller,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  Request,
} from '@nestjs/common';

import { EstimateService } from './estimate.service';
import { EntryEntity } from 'models';
import { TopEntriesResponseDto, IEstimate } from './dto/estimate.dto';
import { ENTRY_TYPES } from '../entry/entry.constants';
import { AuthHelper } from 'modules/auth/auth.helpers';

@Controller('estimate')
export class EstimateController {
  constructor(
    private readonly estimateService: EstimateService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  public async getEstimates(
    @Body('text') newPDFText,
  ) {
    const topSimilarDocuments = await this.estimateService
      .getDegreeOfSimilarity(newPDFText);
    const entries = await EntryEntity.findAll({
      where: {
        matterName: topSimilarDocuments
          .map(({ document }) => document.matterName)
      }
    });

    return {
      expense: this.estimateService
        .calculateEstimates(ENTRY_TYPES.EXPENSE, entries),
      time: this.estimateService
        .calculateEstimates(ENTRY_TYPES.TIME, entries),
    };
  }

  @Get('statistics')
  @HttpCode(HttpStatus.OK)
  public async getStatistic(
    @Query('monthsCount') monthsCount,
    @Query('daysCount') daysCount,
    @Query('dataSource') dataSource,
    @Request() request,
  ) {
    const options = {
      monthsCount,
      daysCount,
      dataSource,
    };
    const token = AuthHelper.getToken(request);

    return this.estimateService.getStatistic(token, options);
  }

  @Post('similarity-degree')
  @HttpCode(HttpStatus.OK)
  public getDegreeOfSimilarity(
    @Body('text') newPDFText,
  ) {
    return this.estimateService.getDegreeOfSimilarity(newPDFText);
  }

  @Get('top-entries')
  @HttpCode(HttpStatus.OK)
  public async getTopEntries(
    @Query('text') newPDFText,
  ) {
    const successResponse: TopEntriesResponseDto = {
      entries: [],
      success: false,
    };
    const topSimilarDocuments = await this.estimateService
      .getDegreeOfSimilarity(newPDFText);
    const entries = await EntryEntity.findAll({
      where: {
        matterName: topSimilarDocuments
          .map(({ document }) => document.matterName)
      }
    });
    successResponse.success = true;
    successResponse.entries = entries;
    return successResponse;
  }
}
