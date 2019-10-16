import {
  Injectable, InternalServerErrorException,
} from '@nestjs/common';
import EstimateEntity from '../estimate/estimate.entity';
import { DocumentEntity, EntryEntity, BaMatterEntity, BaEntryEntity, BaClientEntity } from 'models';
import { ENTRY_TYPES, TRANSACTION_TYPES } from '../entry/entry.constants';
import { IEstimate } from './dto/estimate.dto';
import { Sequelize } from 'sequelize-typescript';
import {
  getFrom,
  getMonthsList,
  parseMinutesFromString,
} from '../core/utils';
import { DEFAULT_DAYS_COUNT, DEFAULT_MONTHS_COUNT, MONTH_FORMAT, DEFAULT_DATA_SOURCE, DATA_SOURCES } from './estimate.constansts';
import * as moment from 'moment';
import databaseConfig from '../../config/database.config';
import { AuthHelper } from 'modules/auth/auth.helpers';
type Moment = moment.Moment;
@Injectable()
export class EstimateService {
  private static splitWordsPattern = /[\W_\n\t]+/;
  private static topThreshold = 0.05;

  public async getDegreeOfSimilarity(
    newPDFText: string,
  ) {
    const wordsToFind = newPDFText
      .toLowerCase()
      .split(EstimateService.splitWordsPattern)
      .filter(text => text.length > 0);
    const historicalDocuments = await DocumentEntity.findAll();
    const similarityDegreeByDocuments = historicalDocuments.map(document => ({
      document,
      similarityDegree: this.calculateDegreeOfSimilarity(
        wordsToFind,
        document,
      ),
    }));
    const topSimilarityCount =
      similarityDegreeByDocuments.length * EstimateService.topThreshold;

    return similarityDegreeByDocuments
      .sort((first, second) =>
        first.similarityDegree < second.similarityDegree ? 1 : -1
      )
      .slice(0, Math.max(topSimilarityCount, 1));
  }

  public calculateEstimates(type: string, entries: EntryEntity[]): IEstimate {
    const valueKey = type === TRANSACTION_TYPES.TIME
      ? 'timeSpent'
      : 'price';
    const entriesByType = entries
      .filter(entry => entry.transactionType === type);

    const totalValue = valueKey === 'price'
      ? entriesByType.reduce((total, entry) => total + entry[valueKey], 0)
      : entriesByType.reduce((total, entry) =>
        total + parseMinutesFromString(entry[valueKey]), 0);

    const meanValue = totalValue / entriesByType.length;
    let squaredDeviation;
    if (valueKey === 'price') {
      squaredDeviation = entriesByType
        .reduce((total, entry) =>
          total + (entry[valueKey] - meanValue) * (entry[valueKey] - meanValue),
          0,
      );
    } else {
      squaredDeviation = entriesByType
        .reduce((total, entry) =>
          total
            + (parseMinutesFromString(entry[valueKey]) - meanValue)
            * (parseMinutesFromString(entry[valueKey]) - meanValue),
          0,
      );
    }
    const deviation = Math.sqrt(squaredDeviation / (entriesByType.length - 1));

    const [firstEntry = null] = entriesByType;
    const closestEstimates: IEstimate = entriesByType
      .reduce((estimates, entry) => {
        const lowEstimateValue = meanValue - deviation / 2;
        const mediumEstimateValue = meanValue;
        const highEstimateValue = meanValue + deviation / 2;
        const absDiff = (first, second) => Math.abs(first - second);
        const isEntryCloserToLowEstimate =
          absDiff(entry[valueKey], lowEstimateValue) <
          absDiff(estimates.lowEstimate[valueKey], lowEstimateValue);
        const isEntryCloserToMediumEstimate =
          absDiff(entry[valueKey], mediumEstimateValue) <
          absDiff(estimates.mediumEstimate[valueKey], mediumEstimateValue);
        const isEntryCloserToHighEstimate =
          absDiff(entry[valueKey], highEstimateValue) <
          absDiff(estimates.highEstimate[valueKey], highEstimateValue);

        return {
          lowEstimate: isEntryCloserToLowEstimate
            ? entry
            : estimates.lowEstimate,
          mediumEstimate: isEntryCloserToMediumEstimate
            ? entry
            : estimates.mediumEstimate,
          highEstimate: isEntryCloserToHighEstimate
            ? entry
            : estimates.highEstimate,
          average: null,
        };
      },
      {
        lowEstimate: firstEntry,
        mediumEstimate: firstEntry,
        highEstimate: firstEntry,
        average: null,
      },
    );
    if (
      closestEstimates.lowEstimate
      && closestEstimates.mediumEstimate
      && closestEstimates.highEstimate
    ) {
      if (valueKey === 'price') {
        closestEstimates.average = (
          closestEstimates.lowEstimate[valueKey]
          + closestEstimates.mediumEstimate[valueKey]
          + closestEstimates.highEstimate[valueKey]
        ) / 3;
      } else {
        closestEstimates.average = (
          parseMinutesFromString(closestEstimates.lowEstimate[valueKey])
          + parseMinutesFromString(closestEstimates.mediumEstimate[valueKey])
          + parseMinutesFromString(closestEstimates.highEstimate[valueKey])
        ) / 3;
      }
      this.createEstimateRecord(type, closestEstimates);
    }

    return closestEstimates;
  }

  public async getStatistic(token, options?: object) {
    const result = {
      estimatesCount: null,
      totalAmountCents: null,
      mattersCount: null,
      entriesCount: null,
      estimatesCountByEachMonth: null,
      amountCentsByEachMonth: null,
      mattersCountByEachMonth: null,
    };
    const { account_id: accountId } = AuthHelper.decodeTokenPayload(token);
    try {
      const daysCount =
        getFrom(options, 'daysCount', DEFAULT_DAYS_COUNT);
      const monthsCount =
        getFrom(options, 'monthsCount', DEFAULT_MONTHS_COUNT);
      const dataSource =
        getFrom(options, 'dataSource', DEFAULT_DATA_SOURCE);

      const lastDaysEstimates = await this
        .getAllEstimatesSinceDays(daysCount, accountId);
      result.estimatesCount  = lastDaysEstimates.length;
      result.totalAmountCents = this.getTotalAmountCents(lastDaysEstimates);
      const baMattersCount = await BaMatterEntity.count({
        include: [{
          model: BaClientEntity,
          as: 'client',
          where: {
            accountId,
          },
        }],
      });
      const { length: mattersCount } = await this
        .getUniqueMatterNames(accountId);
      const entriesCount = await EntryEntity.count({
        where: {
          accountId,
        }
      });
      const baEntriesCount = await BaEntryEntity.count({
        include: [{
          model: BaMatterEntity,
          as: 'matter',
          include: [{
            model: BaClientEntity,
            as: 'client',
            where: { accountId },
          }],
        }],
      });

      const lastMonthsEstimates = await this
        .getEstimatesByEachMonth(monthsCount, accountId);
      result.estimatesCountByEachMonth = this
        .getCountByEachMonth(lastMonthsEstimates);
      result.amountCentsByEachMonth = this
        .getAmountCentsByEachMonth(lastMonthsEstimates);
      const mattersByEachMonth = await this
        .getMattersByEachMonth(monthsCount, accountId, dataSource);
      result.mattersCountByEachMonth = this
        .getCountByEachMonth(mattersByEachMonth);

      switch (dataSource) {
        case DATA_SOURCES.E_DATA:
          result.mattersCount = baMattersCount;
          result.entriesCount = baEntriesCount;
          break;
        case DATA_SOURCES.OWN_DATA:
          result.mattersCount = mattersCount;
          result.entriesCount = entriesCount;
          break;
        case DATA_SOURCES.USE_BOTH:
          result.mattersCount = mattersCount + baMattersCount;
          result.entriesCount = entriesCount + baEntriesCount;
          break;
        default:
          break;
      }
    } catch ({ message }) {
      throw new InternalServerErrorException(message);
    }

    return result;
  }

  private createEstimateRecord(type: string, estimateData: IEstimate) {
    const {
      lowEstimate,
      mediumEstimate,
      highEstimate,
      average,
    } = estimateData;

    EstimateEntity.create({
      type,
      lowEstimateId: lowEstimate.id,
      mediumEstimateId: mediumEstimate.id,
      highEstimateId: highEstimate.id,
      average,
    });
  }

  private calculateDegreeOfSimilarity(
    wordsToFind: string[],
    document: DocumentEntity,
  ) {
    const documentWords = document.text
      .toLowerCase()
      .split(EstimateService.splitWordsPattern);

    return wordsToFind.reduce(
      (count, word) => documentWords.includes(word) ? count + 1 : count,
      0,
    );
  }

  private getCountByEachMonth(formattedData) {
    const count = {};

    for (const key in formattedData) {
      if (formattedData[key])  {
        count[key] = formattedData[key].length;
      }
    }

    return count;
  }
  private getAmountCentsByEachMonth(sortedEstimates) {
    const sortedEstimatesCents = {};
    for (const key in sortedEstimates) {
      if (sortedEstimates[key]) {
        const cents = this.getTotalAmountCents(sortedEstimates[key]);
        sortedEstimatesCents[key] = cents || 0;
      }
    }

    return sortedEstimatesCents;
  }
  private async getAllEstimatesSinceMonths(monthsCount: number, accountId) {
    const lastMonthsAgoDate = moment()
      .subtract(monthsCount - 1, 'months').startOf('month');
    return await this.getAllEstimatesFromDate(lastMonthsAgoDate, accountId);
  }
  private async getAllEstimatesSinceDays(daysCount: number, accountId) {
    const lastDaysAgoDate = moment()
      .subtract(daysCount - 1, 'days')
      .startOf('day');

    return await this.getAllEstimatesFromDate(lastDaysAgoDate, accountId);
  }
  private async getAllEstimatesFromDate(date: Moment, accountId) {
    const {
      DB_DATETIME_FORMAT,
    } = databaseConfig;

    return EstimateEntity.findAll({
      include: [{
        model: EntryEntity,
        as: 'lowEstimate',
        where: {
          accountId,
        },
      }, {
        model: EntryEntity,
        as: 'mediumEstimate',
        where: {
          accountId,
        },
      }, {
        model: EntryEntity,
        as: 'highEstimate',
        where: {
          accountId,
        },
      }],
      where: {
        createdAt:{
          [Sequelize.Op.gte]: date.format(DB_DATETIME_FORMAT),
        }
      }
    });
  }
  private async getEstimatesByEachMonth(monthsCount: number, accountId) {
    const lastMonthsEstimates = await this
    .getAllEstimatesSinceMonths(monthsCount, accountId);

    return this.formatDataByEachMonth(lastMonthsEstimates, monthsCount);
  }

  private async getMattersByEachMonth(
    monthsCount: number,
    accountId,
    dataSource,
  ) {
    const lastMonthsAgoStartDate = moment()
      .subtract(monthsCount - 1, 'months').startOf('month');
    const lastMonthsBaMatters = await BaMatterEntity.findAll({
      attributes:[
        'id',
        'createdAt',
      ],
      where:{
        createdAt:{
          [Sequelize.Op.gte]: lastMonthsAgoStartDate,
        }
      },
      include: [{
        model: BaClientEntity,
        where: { accountId },
      }]
    });

    const lastMonthsEntries = await EntryEntity.findAll({
      where: {
        accountId,
      },
    });
    const uniqueMatterNames = await this.getUniqueMatterNames(accountId);
    const matterNamesWithDates = uniqueMatterNames.map((name) => {
      const dates = lastMonthsEntries
        .filter(entry => entry.matterName === name)
        .map(entry => moment(entry.createdAt));
      return { matterName: name, createdAt: moment.min(dates) };
    });
    let dataToFormat;

    switch (dataSource) {
      case DATA_SOURCES.E_DATA:
        dataToFormat = lastMonthsBaMatters;
        break;
      case DATA_SOURCES.OWN_DATA:
        dataToFormat = matterNamesWithDates;
        break;
      case DATA_SOURCES.USE_BOTH:
        dataToFormat = [...lastMonthsBaMatters, ...matterNamesWithDates];
        break;
      default:
        dataToFormat = [];
        break;
    }

    return this.formatDataByEachMonth(
      dataToFormat,
      monthsCount,
    );
  }

  private formatDataByEachMonth(data, monthsCount) {
    const currentDate = moment();
    const lastMonthsAgoStartDate = moment()
      .subtract(monthsCount - 1, 'months').startOf('month');
    const months =
      getMonthsList(lastMonthsAgoStartDate, currentDate, MONTH_FORMAT);
    const formattedData = {};
    months.forEach((month) => { formattedData[month] = []; });
    data
      .forEach((item) => {
        formattedData[moment(item.createdAt).format(MONTH_FORMAT)]
          .push(item);
      });

    return formattedData;
  }

  private getTotalAmountCents(estimates) {
    return estimates.reduce((sum, estimate) => {
      return sum +
        estimate.lowEstimate.price +
        estimate.mediumEstimate.price +
        estimate.highEstimate.price;
    }, 0);
  }

  private async getUniqueMatterNames(accountId) {
    const entries = await EntryEntity.findAll({
      where: { accountId },
    });

    return entries
      .map(entry => entry.matterName)
      .filter((name, index, names) => name && names.indexOf(name) === index);
  }
}
