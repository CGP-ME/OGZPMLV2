'use strict';

const TradingConfig = require('./TradingConfig');

const VALID_MODELS = new Set(['percent', 'per_share_minimum']);

function finiteNumber(value, label) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`[FEE_MODEL] ${label} must be finite; got ${value}`);
  }
  return numeric;
}

function nonNegativeNumber(value, label) {
  const numeric = finiteNumber(value, label);
  if (numeric < 0) {
    throw new Error(`[FEE_MODEL] ${label} must be non-negative; got ${value}`);
  }
  return numeric;
}

function positiveNumber(value, label) {
  const numeric = finiteNumber(value, label);
  if (numeric <= 0) {
    throw new Error(`[FEE_MODEL] ${label} must be positive; got ${value}`);
  }
  return numeric;
}

class FeeModel {
  constructor(config = {}) {
    const model = String(config.model || 'percent').trim().toLowerCase();
    if (!VALID_MODELS.has(model)) {
      throw new Error(`[FEE_MODEL] unsupported fees.model=${config.model}`);
    }

    this.model = model;
    this.makerFee = nonNegativeNumber(config.makerFee ?? 0, 'makerFee');
    this.takerFee = nonNegativeNumber(config.takerFee ?? 0, 'takerFee');
    this.totalRoundTrip = nonNegativeNumber(
      config.totalRoundTrip ?? (this.makerFee + this.takerFee),
      'totalRoundTrip'
    );
    this.perShare = nonNegativeNumber(config.perShare ?? 0, 'perShare');
    this.minOrderFee = nonNegativeNumber(config.minOrderFee ?? 0, 'minOrderFee');
  }

  static fromTradingConfig() {
    return new FeeModel({
      model: TradingConfig.get('fees.model'),
      makerFee: TradingConfig.get('fees.makerFee'),
      takerFee: TradingConfig.get('fees.takerFee'),
      totalRoundTrip: TradingConfig.get('fees.totalRoundTrip'),
      perShare: TradingConfig.get('fees.perShare'),
      minOrderFee: TradingConfig.get('fees.minOrderFee'),
    });
  }

  static percent({ makerFee = 0, takerFee = 0, totalRoundTrip = null } = {}) {
    if (totalRoundTrip !== null && makerFee === 0 && takerFee === 0) {
      const half = Number(totalRoundTrip) / 2;
      return new FeeModel({
        model: 'percent',
        makerFee: half,
        takerFee: half,
        totalRoundTrip,
      });
    }
    return new FeeModel({
      model: 'percent',
      makerFee,
      takerFee,
      totalRoundTrip: totalRoundTrip ?? (Number(makerFee) + Number(takerFee)),
    });
  }

  static feeContextFromTrade(trade = {}) {
    const quantity = Number(
      trade.remainingOrderQuantity
        ?? trade.entryOrderQuantity
        ?? trade.orderQuantity
        ?? trade.quantity
    );
    const notionalFromFields = Number(
      trade.remainingSizeUsd
        ?? trade.sizeUsd
        ?? trade.remainingSize
        ?? trade.size
        ?? trade.positionSizeUsd
    );
    const notionalFromQuantity = Number(trade.entryPrice) * quantity;
    const notionalUsd = Number.isFinite(notionalFromFields) && notionalFromFields > 0
      ? notionalFromFields
      : notionalFromQuantity;

    return {
      entryNotionalUsd: notionalUsd,
      exitNotionalUsd: notionalUsd,
      entryQuantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
      exitQuantity: Number.isFinite(quantity) && quantity > 0 ? quantity : undefined,
    };
  }

  calculateRoundTripFeePercentForTrade(trade) {
    return this.calculateRoundTripFeePercent(FeeModel.feeContextFromTrade(trade));
  }

  static roundTripFeePercentForTrade(trade) {
    return FeeModel.fromTradingConfig().calculateRoundTripFeePercentForTrade(trade);
  }

  _rateForSide(side) {
    if (side === 'entry' || side === 'maker') return this.makerFee;
    if (side === 'exit' || side === 'taker') return this.takerFee;
    throw new Error(`[FEE_MODEL] side must be entry/maker or exit/taker; got ${side}`);
  }

  calculateOrderFee({ notionalUsd, quantity, side }) {
    const notional = nonNegativeNumber(notionalUsd, 'notionalUsd');

    if (this.model === 'percent') {
      return notional * this._rateForSide(side);
    }

    const orderQuantity = nonNegativeNumber(quantity, 'quantity');
    if (orderQuantity <= 0) {
      throw new Error(`[FEE_MODEL] quantity must be positive for per_share_minimum model; got ${quantity}`);
    }
    return Math.max(orderQuantity * this.perShare, this.minOrderFee);
  }

  calculateRoundTripFees({
    entryNotionalUsd,
    exitNotionalUsd,
    entryQuantity,
    exitQuantity,
  }) {
    return (
      this.calculateOrderFee({
        notionalUsd: entryNotionalUsd,
        quantity: entryQuantity,
        side: 'entry',
      })
      + this.calculateOrderFee({
        notionalUsd: exitNotionalUsd,
        quantity: exitQuantity,
        side: 'exit',
      })
    );
  }

  calculateRoundTripFeeRate({
    entryNotionalUsd,
    exitNotionalUsd = entryNotionalUsd,
    entryQuantity,
    exitQuantity = entryQuantity,
  }) {
    const baseNotional = positiveNumber(entryNotionalUsd, 'entryNotionalUsd');
    const fees = this.calculateRoundTripFees({
      entryNotionalUsd: baseNotional,
      exitNotionalUsd,
      entryQuantity,
      exitQuantity,
    });
    return fees / baseNotional;
  }

  calculateRoundTripFeePercent(context) {
    return this.calculateRoundTripFeeRate(context) * 100;
  }
}

module.exports = FeeModel;
