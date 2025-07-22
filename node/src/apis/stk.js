// src/apis/stk.js
// Safaricom STK related API methods to be mixed into the main Safaricom class

import { _getTimestamp } from "../utils.js";
import { Buffer } from "node:buffer";

export const stk = {
  /**
   * Initiates an M-Pesa STK Push, which sends a payment prompt to the customer's phone.
   * Documentation mirrors the previous monolithic implementation.
   * @param {object} params - The STK Push parameters.
   * @param {number} params.Amount - The amount to be paid.
   * @param {string} params.PhoneNumber - The customer's phone number in the format `2547XXXXXXXX`.
   * @param {string} params.CallBackURL - Your callback URL to receive the result.
   * @param {string} params.AccountReference - Account reference to appear on the customer's statement.
   * @param {string} params.TransactionDesc - A brief description of the transaction.
   * @param {string} [params.TransactionType='CustomerPayBillOnline'] - Optional transaction type.
   * @returns {Promise<object>} The API response.
   */
  async stkPush(params) {
    if (!this.passkey) {
      throw new Error("Passkey is required for STK Push.");
    }

    const endpoint = "/mpesa/stkpush/v1/processrequest";
    const timestamp = _getTimestamp();
    const password = Buffer.from(
      this.shortCode + this.passkey + timestamp
    ).toString("base64");

    const requestBody = {
      BusinessShortCode: this.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: params.TransactionType || "CustomerPayBillOnline",
      Amount: params.Amount,
      PartyA: params.PhoneNumber,
      PartyB: this.shortCode,
      PhoneNumber: params.PhoneNumber,
      CallBackURL: params.CallBackURL,
      AccountReference: params.AccountReference,
      TransactionDesc: params.TransactionDesc,
    };

    return this._makeRequest(endpoint, requestBody);
  },

  /**
   * Queries the status of an STK Push transaction.
   * @param {object} params - Parameters for query.
   * @param {string} params.CheckoutRequestID - The checkout request ID returned from stkPush.
   * @returns {Promise<object>} The API response.
   */
  async stkQuery(params) {
    if (!this.passkey) {
      throw new Error("Passkey is required for STK Query.");
    }

    const endpoint = "/mpesa/stkpushquery/v1/query";
    const timestamp = _getTimestamp();
    const password = Buffer.from(
      this.shortCode + this.passkey + timestamp
    ).toString("base64");

    const requestBody = {
      BusinessShortCode: this.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: params.CheckoutRequestID,
    };

    return this._makeRequest(endpoint, requestBody);
  },
};