import axios from "axios";
import { Buffer } from "node:buffer";

const BASE_URLS = {
  sandbox: "https://sandbox.safaricom.co.ke",
  production: "https://api.safaricom.co.ke",
};

/**
 * Main class for interacting with the Safaricom Daraja API.
 */
class Safaricom {
  /**
   * @param {object} options - The configuration options.
   * @param {string} options.consumerKey - Your app's consumer key.
   * @param {string} options.consumerSecret - Your app's consumer secret.
   * @param {string} options.shortCode - Your organization's shortcode.
   * @param {string} [options.passkey] - The STK Push passkey.
   * @param {string} [options.initiatorName] - The initiator name for B2C, B2B, etc.
   * @param {string} [options.securityCredential] - The security credential for B2C, Reversal, etc.
   * @param {string} [options.environment='sandbox'] - The environment ('sandbox' or 'production').
   */
  constructor(options) {
    if (!options.consumerKey || !options.consumerSecret || !options.shortCode) {
      throw new Error(
        "Consumer key, consumer secret, and shortcode are required."
      );
    }

    this.consumerKey = options.consumerKey;
    this.consumerSecret = options.consumerSecret;
    this.shortCode = options.shortCode;
    this.passkey = options.passkey;
    this.initiatorName = options.initiatorName;
    this.securityCredential = options.securityCredential;
    this.environment = options.environment || "sandbox";
    this.baseUrl = BASE_URLS[this.environment];

    if (!this.baseUrl) {
      throw new Error(
        `Invalid environment specified: ${this.environment}. Use 'sandbox' or 'production'.`
      );
    }

    this.token = null;
    this.tokenExpiresAt = null;
  }

  /**
   * Generates the timestamp in YYYYMMDDHHMMSS format.
   * @returns {string} The formatted timestamp.
   * @private
   */
  _getTimestamp() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${year}${month}${day}${hours}${minutes}${seconds}`;
  }

  /**
   * Fetches a new OAuth token or returns a cached one if it's still valid.
   * @returns {Promise<string>} The access token.
   * @private
   */
  async _getAuthToken() {
    if (this.token && this.tokenExpiresAt && this.tokenExpiresAt > Date.now()) {
      return this.token;
    }

    const auth = Buffer.from(
      `${this.consumerKey}:${this.consumerSecret}`
    ).toString("base64");

    try {
      const response = await axios.get(
        `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
        {
          headers: {
            Authorization: `Basic ${auth}`,
          },
        }
      );

      const { access_token, expires_in } = response.data;
      this.token = access_token;
      this.tokenExpiresAt = Date.now() + (expires_in - 60) * 1000; // 1 minute before expiry
      return this.token;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Makes an authenticated POST request to the Daraja API.
   * @param {string} endpoint - The API endpoint to call.
   * @param {object} body - The request body.
   * @returns {Promise<object>} The response data.
   * @private
   */
  async _makeRequest(endpoint, body) {
    const token = await this._getAuthToken();
    try {
      const response = await axios.post(`${this.baseUrl}${endpoint}`, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      return response.data;
    } catch (error) {
      throw this._handleError(error);
    }
  }

  /**
   * Handles errors from API requests with user-friendly messages.
   * @param {object} error - The error object from Axios.
   * @returns {Error} A formatted, user-friendly error object.
   * @private
   */
  _handleError(error) {
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      const { status, data } = error.response;
      let userMessage;

      // Use the specific error code from Daraja if available
      const errorCode =
        data.errorCode ||
        (data.fault ? data.fault.code : null) ||
        data.ResultCode;
      const errorMessage =
        data.errorMessage ||
        (data.fault ? data.fault.faultstring : null) ||
        data.ResultDesc ||
        JSON.stringify(data);

      switch (String(errorCode)) {
        // Authentication and Request Errors
        case "400.008.01":
          userMessage = `Authentication Failed. Please check if your Consumer Key and Consumer Secret are correct. The Daraja API returned: ${errorMessage}`;
          break;
        case "400.008.02":
          userMessage = `Invalid Grant Type. The library sent 'client_credentials' as required, but the API rejected it. This may be a temporary issue with the API. The Daraja API returned: ${errorMessage}`;
          break;
        case "404.001.04":
          userMessage = `Invalid Authentication Header. This can happen if the access token is missing or incorrect. The Daraja API returned: ${errorMessage}`;
          break;
        case "400.002.05":
          userMessage = `Invalid Request Payload. Please check that all required parameters for this API call are correct and have the right format. The Daraja API returned: ${errorMessage}`;
          break;
        case "400.003.01":
          userMessage = `Invalid Access Token. Your token has likely expired. The library will automatically try to get a new one on the next request. The Daraja API returned: ${errorMessage}`;
          break;

        // STK Push Specific Errors (from Callback)
        case "1":
          userMessage = `Insufficient Funds. The customer's M-Pesa account has insufficient funds to complete the transaction. Please advise the customer to top up or use Fuliza.`;
          break;
        case "1001":
          userMessage = `Transaction in Progress. The customer has another M-Pesa transaction in progress. Please advise them to complete or cancel the other transaction before retrying.`;
          break;
        case "1019":
          userMessage = `Transaction Expired. The request took too long to process and has expired. Please try initiating the transaction again.`;
          break;
        case "1025":
          userMessage = `An internal error occurred while sending the push request. This might be a temporary issue with the M-Pesa service. Please try again shortly.`;
          break;
        case "1032":
          userMessage = `Request Cancelled by User. The customer cancelled the M-Pesa PIN entry prompt on their phone.`;
          break;
        case "1037":
          userMessage = `STK Push Timeout. The request timed out because the customer's phone was unreachable or they did not respond in time. Please ensure the customer's phone is online and advise them to try again.`;
          break;
        case "2001":
          userMessage = `Invalid PIN. The customer entered the wrong M-Pesa PIN. Please ask them to try again with the correct PIN.`;
          break;

        // --- B2C & Account Balance Specific Errors ---
        case "15":
          userMessage = `Duplicate Request. A request with the same unique identifier has already been processed. Please ensure each request has a unique OriginatorConversationID.`;
          break;
        case "17":
          userMessage = `Internal Failure. An unspecified error occurred within the M-Pesa system. Please try again later.`;
          break;
        case "18":
          userMessage = `Initiator Credential Check Failure. The Security Credential provided is incorrect. Please verify and encrypt your initiator password again.`;
          break;
        case "20":
          userMessage = `Unresolved Initiator. The InitiatorName you provided could not be found. Please check your credentials.`;
          break;
        case "21":
          userMessage = `Permission Failure. The initiator does not have permission to perform this action on the specified shortcode.`;
          break;
        case "26":
          userMessage = `System Busy. The M-Pesa system is currently experiencing high traffic. Please try your request again in a few moments.`;
          break;
        case "2001":
          userMessage = `Invalid Initiator Information. The 'initiatorName' or 'securityCredential' you provided is incorrect. Please check your credentials on the Safaricom Developer Portal.`;
          break;

        // --- B2C Specific Errors ---
        case "2001":
          userMessage = `Invalid Initiator Information. The 'initiatorName' or 'securityCredential' you provided is incorrect. Please check your credentials on the Safaricom Developer Portal.`;
          break;

        // --- B2B Express Checkout Errors ---
        case "4102":
          userMessage = `Merchant KYC Fail. There is an issue with the merchant's account details (KYC). Please ensure the merchant's account is fully compliant.`;
          break;
        case "4104":
          userMessage = `Missing Nominated Number. The merchant's Till Number is not properly configured with a nominated phone number on the M-Pesa portal.`;
          break;
        case "4201":
        case "4203":
          userMessage = `USSD Network Error. There was a problem with the USSD network when trying to send the prompt to the merchant. This is often temporary. Please try again.`;
          break;

        // --- C2B Specific Errors ---
        case "500.003.1001":
          if (errorMessage.includes("already registered")) {
            userMessage = `URLs are already registered for this ShortCode. In the production environment, you can only register URLs once. To change them, please contact Safaricom API support.`;
          } else if (errorMessage.includes("Duplicate notification info")) {
            userMessage = `Duplicate URLs. You may have registered these URLs on another platform (like the old aggregator platform). Please contact Safaricom support to have the old URLs deleted before registering here.`;
          } else {
            userMessage = `An internal server error occurred at the API. Please try again later. Details: ${errorMessage}`;
          }
          break;

        // --- Bill Manager Specific Errors ---
        case "409":
          if (errorMessage.includes("Biller already Registered")) {
            userMessage = `This shortcode is already opted into Bill Manager. You do not need to opt-in again.`;
          } else if (errorMessage.includes("Invalid consumerkey/shortcode")) {
            userMessage = `Invalid credentials. Please ensure the 'consumerKey' and 'shortCode' you are using are correct and linked.`;
          } else if (errorMessage.includes("Another entry exist")) {
            userMessage = `Duplicate Invoice. An invoice with this 'externalReference' number already exists. Please use a unique reference for each invoice.`;
          } else if (errorMessage.includes("Incorrect phone number format")) {
            userMessage = `Invalid Phone Number. Please ensure the 'billedPhoneNumber' is a valid Safaricom number in the format 07XXXXXXXX.`;
          } else if (errorMessage.includes("Incorrect due date format")) {
            userMessage = `Invalid Date Format. Please ensure the 'dueDate' is in the format YYYY-MM-DD.`;
          } else if (errorMessage.includes("cannot be cancelled")) {
            userMessage = `Invoice Cannot Be Cancelled. The invoice has likely been partially or fully paid. Only unpaid invoices can be cancelled.`;
          } else {
            userMessage = `A conflict error occurred. The API returned: ${errorMessage}`;
          }
          break;

        default:
          userMessage = `The API request failed with status code ${status}. The API returned the following message: ${errorMessage}`;
      }

      return new Error(userMessage);
    } else if (error.request) {
      // The request was made but no response was received
      return new Error(
        "The request failed because no response was received from the Safaricom server. This could be due to a network issue or the Daraja API being temporarily unavailable. Please check your internet connection and try again."
      );
    } else {
      // Something happened in setting up the request that triggered an Error
      return new Error(
        `An unexpected error occurred while setting up the API request: ${error.message}`
      );
    }
  }

  /**
   * Initiates an M-Pesa STK Push, which sends a payment prompt to the customer's phone.
   * The library automatically handles the `BusinessShortCode`, `Password`, and `Timestamp`.
   * @param {object} params - The STK Push parameters.
   * @param {number} params.Amount - The amount to be paid (e.g., 100).
   * @param {string} params.PhoneNumber - The customer's phone number in the format `2547XXXXXXXX`.
   * @param {string} params.CallBackURL - A secure URL on your server where Safaricom will send the final transaction result.
   * @param {string} params.AccountReference - A short identifier for the transaction, visible to the customer (e.g., "Order-123").
   * @param {string} params.TransactionDesc - A brief description of the payment.
   * @param {string} [params.TransactionType='CustomerPayBillOnline'] - The type of transaction. Use 'CustomerPayBillOnline' for Paybill or 'CustomerBuyGoodsOnline' for Buy Goods/Till numbers.
   * @returns {Promise<object>} A promise that resolves with the initial acknowledgment from the API.
   * On success, this object contains:
   * - `MerchantRequestID`: A unique ID for your request.
   * - `CheckoutRequestID`: A unique ID for the transaction, which you can use to query the status later.
   * - `ResponseCode`: '0' indicates the request was accepted successfully.
   * - `ResponseDescription`: A success message.
   * - `CustomerMessage`: A message confirming the request was accepted.
   * * The final transaction result (whether the customer paid or cancelled) will be sent to your `CallBackURL`.
   */
  async stkPush(params) {
    if (!this.passkey) {
      throw new Error("Passkey is required for STK Push.");
    }

    const endpoint = "/mpesa/stkpush/v1/processrequest";
    const timestamp = this._getTimestamp();
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
  }

  /**
   * Queries the status of an STK Push transaction.
   * @param {object} params - The STK query parameters.
   * @param {string} params.CheckoutRequestID - The unique ID from the STK Push request.
   * @returns {Promise<object>} The API response.
   */
  async stkQuery(params) {
    if (!this.passkey) {
      throw new Error("Passkey is required for STK Query.");
    }
    const endpoint = "/mpesa/stkpushquery/v1/query";
    const timestamp = this._getTimestamp();
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
  }

  /**
   * Registers your Confirmation and Validation URLs with M-Pesa.
   * This is a one-time step that tells Safaricom where to send payment notifications.
   * @param {object} params - The C2B registration parameters.
   * @param {string} params.ConfirmationURL - The secure URL on your server where M-Pesa will send a notification once a payment is successfully completed.
   * @param {string} params.ValidationURL - The secure URL M-Pesa will call to validate a payment before processing it. This is optional and requires activation from Safaricom.
   * @param {string} [params.ResponseType='Completed'] - The default action M-Pesa should take if your Validation URL is unreachable. Use 'Completed' to proceed with the payment or 'Cancelled' to drop it.
   * @returns {Promise<object>} A promise that resolves with the acknowledgment from the API.
   * On success, this object contains:
   * - `OriginatorCoversationID`: A unique ID for the registration request.
   * - `ResponseCode`: '0' indicates the URLs were registered successfully.
   * - `ResponseDescription`: A success message, e.g., "success".
   * * After registration, M-Pesa will send payment details to your URLs as POST requests.
   */
  async c2bRegister(params) {
    const endpoint = "/mpesa/c2b/v1/registerurl";
    const requestBody = {
      ShortCode: this.shortCode,
      ResponseType: params.ResponseType || "Completed",
      ConfirmationURL: params.ConfirmationURL,
      ValidationURL: params.ValidationURL,
    };
    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Simulates a C2B transaction.
   * @param {object} params - The C2B simulation parameters.
   * @param {number} params.Amount - The amount to be paid.
   * @param {string} params.Msisdn - The customer's phone number.
   * @param {string} [params.CommandID='CustomerPayBillOnline'] - The command ID.
   * @param {string} [params.BillRefNumber] - The bill reference number.
   * @returns {Promise<object>} The API response.
   */
  async c2bSimulate(params) {
    const endpoint = "/mpesa/c2b/v1/simulate";
    const requestBody = {
      ShortCode: this.shortCode,
      CommandID: params.CommandID || "CustomerPayBillOnline",
      Amount: params.Amount,
      Msisdn: params.Msisdn,
      BillRefNumber: params.BillRefNumber,
    };
    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Sends a B2C (Business to Customer) payment from your organization's account to a customer's M-Pesa wallet.
   * This is used for payouts like salaries, winnings, or refunds.
   * @param {object} params - The B2C payment parameters.
   * @param {number} params.Amount - The amount of money to send to the customer.
   * @param {string} params.PartyB - The customer's M-Pesa registered phone number in the format `2547XXXXXXXX`.
   * @param {string} params.Remarks - A short message describing the payment (e.g., "June Salary").
   * @param {string} params.QueueTimeOutURL - A secure URL on your server where Safaricom will send a notification if the request times out.
   * @param {string} params.ResultURL - A secure URL on your server where Safaricom will send the final transaction result.
   * @param {string} [params.CommandID='BusinessPayment'] - The type of payment. Can be 'SalaryPayment', 'BusinessPayment', or 'PromotionPayment'.
   * @param {string} [params.Occasion] - An optional, additional comment for the transaction.
   * @returns {Promise<object>} A promise that resolves with the initial acknowledgment from the API.
   * On success, this object contains:
   * - `ConversationID`: A unique ID for the transaction request from M-Pesa.
   * - `OriginatorConversationID`: A unique ID for your initial request.
   * - `ResponseCode`: '0' indicates the request was accepted successfully for processing.
   * - `ResponseDescription`: A success message.
   * * The final transaction result will be sent asynchronously to your `ResultURL`.
   */
  async b2c(params) {
    if (!this.initiatorName || !this.securityCredential) {
      throw new Error(
        "InitiatorName and SecurityCredential are required for B2C transactions."
      );
    }
    const endpoint = "/mpesa/b2c/v1/paymentrequest";
    const requestBody = {
      InitiatorName: this.initiatorName,
      SecurityCredential: this.securityCredential,
      CommandID: params.CommandID || "BusinessPayment",
      Amount: params.Amount,
      PartyA: this.shortCode,
      PartyB: params.PartyB,
      Remarks: params.Remarks,
      QueueTimeOutURL: params.QueueTimeOutURL,
      ResultURL: params.ResultURL,
      Occasion: params.Occasion,
    };
    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Checks the status of a specific M-Pesa transaction (e.g., B2C, C2B).
   * You can use either the `TransactionID` or the `OriginatorConversationID` to identify the transaction.
   * @param {object} params - The transaction status parameters.
   * @param {string} params.TransactionID - The unique M-Pesa Transaction ID that you want to check.
   * @param {string} params.ResultURL - A secure URL on your server where M-Pesa will send the final transaction status details.
   * @param {string} params.QueueTimeOutURL - A secure URL on your server for timeout notifications.
   * @param {string} [params.IdentifierType='4'] - The type of identifier for PartyA. '4' is for a shortcode.
   * @param {string} [params.Remarks] - Optional comments for the query.
   * @param {string} [params.Occasion] - Optional additional information for the query.
   * @returns {Promise<object>} A promise that resolves with the initial acknowledgment from the API.
   * On success, this object contains:
   * - `ConversationID`: A unique ID for the request from M-Pesa.
   * - `OriginatorConversationID`: A unique ID for your initial request.
   * - `ResponseCode`: '0' indicates the request was accepted successfully.
   * - `ResponseDescription`: A success message.
   * * The detailed transaction status will be sent asynchronously to your `ResultURL`.
   */
  async transactionStatus(params) {
    if (!this.initiatorName || !this.securityCredential) {
      throw new Error(
        "InitiatorName and SecurityCredential are required for Transaction Status Query."
      );
    }
    const endpoint = "/mpesa/transactionstatus/v1/query";
    const requestBody = {
      Initiator: this.initiatorName,
      SecurityCredential: this.securityCredential,
      CommandID: "TransactionStatusQuery",
      TransactionID: params.TransactionID,
      PartyA: this.shortCode,
      IdentifierType: params.IdentifierType || "4",
      ResultURL: params.ResultURL,
      QueueTimeOutURL: params.QueueTimeOutURL,
      Remarks: params.Remarks,
      Occasion: params.Occasion,
    };
    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Checks the balance of your M-Pesa business account (Paybill or Till).
   * @param {object} params - The account balance parameters.
   * @param {string} params.ResultURL - A secure URL on your server where M-Pesa will send the account balance details.
   * @param {string} params.QueueTimeOutURL - A secure URL on your server for timeout notifications.
   * @param {string} [params.IdentifierType='4'] - The type of identifier for PartyA. '4' is for a shortcode.
   * @param {string} [params.Remarks='Balance Check'] - Optional comments for the query.
   * @returns {Promise<object>} A promise that resolves with the initial acknowledgment from the API.
   * On success, this object contains:
   * - `ConversationID`: A unique ID for the request from M-Pesa.
   * - `OriginatorConversationID`: A unique ID for your initial request.
   * - `ResponseCode`: '0' indicates the request was accepted successfully.
   * - `ResponseDescription`: A success message.
   * * The detailed account balance will be sent asynchronously to your `ResultURL`. The balance string is pipe-separated.
   */
  async accountBalance(params) {
    if (!this.initiatorName || !this.securityCredential) {
      throw new Error(
        "InitiatorName and SecurityCredential are required for Account Balance Query."
      );
    }
    const endpoint = "/mpesa/accountbalance/v1/query";
    const requestBody = {
      Initiator: this.initiatorName,
      SecurityCredential: this.securityCredential,
      CommandID: "AccountBalance",
      PartyA: this.shortCode,
      IdentifierType: params.IdentifierType || "4",
      Remarks: params.Remarks || "Balance Check",
      QueueTimeOutURL: params.QueueTimeOutURL,
      ResultURL: params.ResultURL,
    };
    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Reverses a completed M-Pesa C2B transaction, sending the money back to the customer.
   * This is used in cases of errors, such as a customer being overcharged.
   * @param {object} params - The reversal parameters.
   * @param {string} params.TransactionID - The unique M-Pesa Transaction ID of the original transaction you want to reverse.
   * @param {number} params.Amount - The exact amount of money to be reversed.
   * @param {string} params.ResultURL - A secure URL on your server where M-Pesa will send the final result of the reversal.
   * @param {string} params.QueueTimeOutURL - A secure URL on your server for timeout notifications.
   * @param {string} [params.RecieverIdentifierType='11'] - The identifier type for the receiver. '11' is for a business shortcode.
   * @param {string} [params.Remarks='Reversal'] - Optional comments for the reversal.
   * @param {string} [params.Occasion] - Optional additional information.
   * @returns {Promise<object>} A promise that resolves with the initial acknowledgment from the API.
   * On success, this object contains:
   * - `ConversationID`: A unique ID for the request from M-Pesa.
   * - `OriginatorConversationID`: A unique ID for your initial request.
   * - `ResponseCode`: '0' indicates the request was accepted successfully.
   * - `ResponseDescription`: A success message.
   * * The final result of the reversal will be sent asynchronously to your `ResultURL`.
   */
  async reversal(params) {
    if (!this.initiatorName || !this.securityCredential) {
      throw new Error(
        "InitiatorName and SecurityCredential are required for Reversals."
      );
    }
    const endpoint = "/mpesa/reversal/v1/request";
    const requestBody = {
      Initiator: this.initiatorName,
      SecurityCredential: this.securityCredential,
      CommandID: "TransactionReversal",
      TransactionID: params.TransactionID,
      Amount: params.Amount,
      ReceiverParty: this.shortCode,
      RecieverIdentifierType: params.RecieverIdentifierType || "11",
      ResultURL: params.ResultURL,
      QueueTimeOutURL: params.QueueTimeOutURL,
      Remarks: params.Remarks || "Reversal",
      Occasion: params.Occasion,
    };
    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Creates a QR code that customers can scan in their M-Pesa App to pay you.
   * This allows for quick payments without the customer typing in your details.
   * @param {object} params - The Dynamic QR parameters.
   * @param {string} params.MerchantName - Your registered business or trade name.
   * @param {string} params.RefNo - A unique reference for the transaction (e.g., an invoice number).
   * @param {number} params.Amount - The amount of money to be paid.
   * @param {string} params.TrxCode - The transaction type. Supported values are:
   * - `BG`: Pay Merchant (Buy Goods).
   * - `WA`: Withdraw Cash at Agent Till.
   * - `PB`: Paybill or Business number.
   * - `SM`: Send Money (to a mobile number).
   * - `SB`: Sent to Business (where CPI is a business number in MSISDN format).
   * @param {string} params.CPI - The Credit Party Identifier. This is the account that will receive the money. It can be a Paybill number, Till Number, Agent Till, or even a mobile number, depending on the `TrxCode`.
   * @param {string} params.Size - The desired size of the QR code image in pixels.
   * @returns {Promise<object>} A promise that resolves to an object containing the QR code details.
   * On success, the object will contain:
   * - `ResponseCode`: A code indicating the status of the request.
   * - `RequestID`: A unique ID for the request.
   * - `ResponseDescription`: A message describing the result, e.g., "QR Code Successfully Generated.".
   * - `QRCode`: A base64 encoded string representing the QR code image.
   */
  async dynamicQR(params) {
    const endpoint = "/mpesa/qrcode/v1/generate";

    const requestBody = {
      MerchantName: params.MerchantName,
      RefNo: params.RefNo,
      Amount: params.Amount,
      TrxCode: params.TrxCode,
      CPI: params.CPI,
      Size: params.Size,
    };

    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Remits tax payments to the Kenya Revenue Authority (KRA).
   * This requires prior integration with KRA to generate a Payment Registration Number (PRN).
   * @param {object} params - The Tax Remittance parameters.
   * @param {number} params.Amount - The amount of tax to be remitted.
   * @param {string} params.AccountReference - The Payment Registration Number (PRN) issued by KRA for the transaction.
   * @param {string} params.ResultURL - A secure URL on your server where M-Pesa will send the final transaction result.
   * @param {string} params.QueueTimeOutURL - A secure URL on your server for timeout notifications.
   * @param {string} [params.Remarks='Tax Payment'] - Optional comments for the transaction.
   * @returns {Promise<object>} A promise that resolves with the initial acknowledgment from the API.
   * On success, this object contains:
   * - `ConversationID`: A unique ID for the request from M-Pesa.
   * - `OriginatorConversationID`: A unique ID for your initial request.
   * - `ResponseCode`: '0' indicates the request was accepted successfully.
   * - `ResponseDescription`: A success message.
   * * The final result of the tax remittance will be sent asynchronously to your `ResultURL`.
   */
  async taxRemittance(params) {
    if (!this.initiatorName || !this.securityCredential) {
      throw new Error(
        "InitiatorName and SecurityCredential are required for Tax Remittance."
      );
    }
    const endpoint = "/mpesa/b2b/v1/remittax"; // Based on KRA B2B remittance endpoint
    const requestBody = {
      Initiator: this.initiatorName,
      SecurityCredential: this.securityCredential,
      CommandID: "PayTaxToKRA",
      SenderIdentifierType: "4",
      RecieverIdentifierType: "4",
      Amount: params.Amount,
      PartyA: this.shortCode,
      PartyB: "572572", // KRA's shortcode is fixed
      AccountReference: params.AccountReference,
      Remarks: params.Remarks || "Tax Payment",
      QueueTimeOutURL: params.QueueTimeOutURL,
      ResultURL: params.ResultURL,
    };
    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Sends a B2B (Business to Business) payment from your business to another.
   * This can be used to pay other businesses' Paybills or Till Numbers.
   * @param {object} params - The B2B payment parameters.
   * @param {number} params.Amount - The amount of money to send.
   * @param {string} params.PartyB - The shortcode of the business you are paying.
   * @param {string} params.AccountReference - An account or reference number for the payment (e.g., an invoice number).
   * @param {string} params.ResultURL - A secure URL on your server where M-Pesa will send the final transaction result.
   * @param {string} params.QueueTimeOutURL - A secure URL on your server for timeout notifications.
   * @param {string} [params.CommandID='BusinessPayBill'] - The type of B2B transaction. Can be 'BusinessPayBill' or 'BusinessBuyGoods'.
   * @param {string} [params.Requester] - (Optional) The customer's phone number if you are paying on their behalf.
   * @param {string} [params.Remarks='Business Payment'] - Optional comments for the transaction.
   * @returns {Promise<object>} A promise that resolves with the initial acknowledgment from the API.
   * On success, this object contains:
   * - `ConversationID`: A unique ID for the request from M-Pesa.
   * - `OriginatorConversationID`: A unique ID for your initial request.
   * - `ResponseCode`: '0' indicates the request was accepted successfully.
   * - `ResponseDescription`: A success message.
   * * The final result of the B2B payment will be sent asynchronously to your `ResultURL`.
   */
  async b2b(params) {
    if (!this.initiatorName || !this.securityCredential) {
      throw new Error(
        "InitiatorName and SecurityCredential are required for B2B transactions."
      );
    }
    const endpoint = "/mpesa/b2b/v1/paymentrequest";
    const requestBody = {
      Initiator: this.initiatorName,
      SecurityCredential: this.securityCredential,
      CommandID: params.CommandID || "BusinessPayBill",
      SenderIdentifierType: "4",
      RecieverIdentifierType: "4",
      Amount: params.Amount,
      PartyA: this.shortCode,
      PartyB: params.PartyB,
      AccountReference: params.AccountReference,
      Requester: params.Requester,
      Remarks: params.Remarks || "Business Payment",
      QueueTimeOutURL: params.QueueTimeOutURL,
      ResultURL: params.ResultURL,
    };
    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Opts your shortcode into the M-Pesa Bill Manager service.
   * This is the first step required to use any of the other Bill Manager APIs.
   * @param {object} params - The opt-in parameters.
   * @param {string} params.email - The official contact email for your business.
   * @param {string} params.officialContact - The official contact phone number for your business.
   * @param {string} params.callbackurl - A secure URL on your server where payment notifications will be sent.
   * @param {string} [params.sendReminders='1'] - Whether to send automatic payment reminders. '1' for yes, '0' for no.
   * @param {string} [params.logo] - (Optional) A string representing the image logo for your invoices.
   * @returns {Promise<object>} A promise that resolves with the acknowledgment from the API.
   */
  async billManagerOptIn(params) {
    const endpoint = "/v1/billmanager-invoice/optin";
    const requestBody = {
      shortcode: this.shortCode,
      email: params.email,
      officialContact: params.officialContact,
      sendReminders: params.sendReminders || "1",
      logo: params.logo,
      callbackurl: params.callbackurl,
    };
    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Sends a single e-invoice to a customer.
   * @param {object} params - The single invoice parameters.
   * @param {string} params.externalReference - A unique ID for the invoice from your system (e.g., "INV-001").
   * @param {string} params.billedFullName - The full name of the customer receiving the invoice.
   * @param {string} params.billedPhoneNumber - The customer's Safaricom phone number (e.g., "07XXXXXXXX").
   * @param {string} params.billedPeriod - The billing period (e.g., "August 2021").
   * @param {string} params.invoiceName - A short name for the invoice (e.g., "Water Bill").
   * @param {string} params.dueDate - The date the payment is due (e.g., "2021-10-12").
   * @param {string} params.accountReference - The customer's account number (e.g., "A1-G70").
   * @param {number} params.amount - The total amount due.
   * @param {Array<object>} [params.invoiceItems] - (Optional) An array of items detailing the invoice. Each item is an object like `{ itemName: 'Rent', amount: '5000' }`.
   * @returns {Promise<object>} A promise that resolves with the acknowledgment from the API.
   */
  async billManagerSingleInvoice(params) {
    const endpoint = "/v1/billmanager-invoice/single-invoicing";
    return this._makeRequest(endpoint, params);
  }

  /**
   * Sends multiple e-invoices to different customers in one API call.
   * @param {Array<object>} invoices - An array of invoice objects. Each object should have the same structure as the `params` for `billManagerSingleInvoice`. You can send up to 1000 invoices at a time.
   * @returns {Promise<object>} A promise that resolves with the acknowledgment from the API.
   */
  async billManagerBulkInvoice(invoices) {
    const endpoint = "/v1/billmanager-invoice/bulk-invoicing";
    return this._makeRequest(endpoint, invoices);
  }

  /**
   * Cancels a single, unpaid invoice that you have already sent.
   * @param {object} params - The cancel invoice parameters.
   * @param {string} params.externalReference - The unique ID of the invoice you want to cancel.
   * @returns {Promise<object>} A promise that resolves with the acknowledgment from the API.
   */
  async billManagerCancelSingleInvoice(params) {
    const endpoint = "/v1/billmanager-invoice/cancel-single-invoice";
    return this._makeRequest(endpoint, params);
  }

  /**
   * Cancels multiple, unpaid invoices that you have already sent.
   * @param {Array<object>} invoices - An array of objects, where each object contains the externalReference of an invoice to cancel, like `[{ externalReference: "INV-001" }, { externalReference: "INV-002" }]`.
   * @returns {Promise<object>} A promise that resolves with the acknowledgment from the API.
   */
  async billManagerCancelBulkInvoice(invoices) {
    const endpoint = "/v1/billmanager-invoice/cancel-bulk-invoices";
    return this._makeRequest(endpoint, invoices);
  }

  /**
   * Updates your M-Pesa Bill Manager details.
   * @param {object} params - The opt-in details to update.
   * @param {string} [params.email] - The new official contact email.
   * @param {string} [params.officialContact] - The new official contact phone number.
   * @param {string} [params.callbackurl] - The new secure URL for payment notifications.
   * @param {string} [params.sendReminders] - New setting for reminders. '1' for yes, '0' for no.
   * @param {string} [params.logo] - (Optional) A new string representing the image logo.
   * @returns {Promise<object>} A promise that resolves with the acknowledgment from the API.
   */
  async billManagerUpdateOptIn(params) {
    const endpoint = "/v1/billmanager-invoice/change-optin-details";
    const requestBody = {
      shortcode: this.shortCode,
      ...params,
    };
    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Initiates a B2B Express Checkout, sending a USSD Push to a merchant's Till Number to pay a vendor's Paybill.
   * This is like an "STK Push for Businesses".
   * @param {object} params - The B2B Express Checkout parameters.
   * @param {string} params.primaryShortCode - The Till Number of the merchant who is paying.
   * @param {number} params.amount - The amount to be paid.
   * @param {string} params.paymentRef - A reference for the payment, which will be shown on the USSD prompt.
   * @param {string} params.callbackUrl - A secure URL on your server where the final transaction result will be sent.
   * @param {string} params.partnerName - Your business name, which will be shown to the merchant on the prompt.
   * @param {string} params.RequestRefID - A unique ID for this specific request from your system.
   * @returns {Promise<object>} A promise that resolves with the initial acknowledgment from the API.
   * On success, this object contains:
   * - `code`: '0' indicates the USSD Push was initiated successfully.
   * - `status`: A success message, e.g., "USSD Initiated Successfully".
   * * The final result (whether the merchant paid or cancelled) will be sent asynchronously to your `callbackUrl`.
   */
  async b2bExpressCheckout(params) {
    const endpoint = "/v1/ussdpush/get-msisdn";
    const requestBody = {
      primaryShortCode: params.primaryShortCode,
      receiverShortCode: this.shortCode, // The receiver is your shortcode
      amount: params.amount,
      paymentRef: params.paymentRef,
      callbackUrl: params.callbackUrl,
      partnerName: params.partnerName,
      RequestRefID: params.RequestRefID,
    };
    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Tops up your B2C account with funds from your main business account.
   * This is used to load funds into your B2C shortcode for making payouts.
   * @param {object} params - The B2C top-up parameters.
   * @param {number} params.Amount - The amount of money to transfer to your B2C account.
   * @param {string} params.PartyB - The B2C shortcode you are topping up.
   * @param {string} params.ResultURL - A secure URL on your server where M-Pesa will send the final transaction result.
   * @param {string} params.QueueTimeOutURL - A secure URL on your server for timeout notifications.
   * @param {string} [params.Remarks='B2C Top Up'] - Optional comments for the transaction.
   * @returns {Promise<object>} A promise that resolves with the initial acknowledgment from the API.
   * On success, this object contains:
   * - `ConversationID`: A unique ID for the request from M-Pesa.
   * - `OriginatorConversationID`: A unique ID for your initial request.
   * - `ResponseCode`: '0' indicates the request was accepted successfully.
   * - `ResponseDescription`: A success message.
   * * The final result of the top-up will be sent asynchronously to your `ResultURL`.
   */
  async b2cAccountTopUp(params) {
    if (!this.initiatorName || !this.securityCredential) {
      throw new Error(
        "InitiatorName and SecurityCredential are required for B2C Account Top Up."
      );
    }
    const endpoint = "/mpesa/b2b/v1/paymentrequest";
    const requestBody = {
      Initiator: this.initiatorName,
      SecurityCredential: this.securityCredential,
      CommandID: "BusinessPayToBulk",
      SenderIdentifierType: "4",
      RecieverIdentifierType: "4",
      Amount: params.Amount,
      PartyA: this.shortCode,
      PartyB: params.PartyB,
      AccountReference: "B2C Top Up", // A default reference can be used
      Remarks: params.Remarks || "B2C Top Up",
      QueueTimeOutURL: params.QueueTimeOutURL,
      ResultURL: params.ResultURL,
    };
    return this._makeRequest(endpoint, requestBody);
  }

  /**
   * Creates an M-Pesa Standing Order (Ratiba) for recurring payments.
   * This sends an STK push to the customer to authorize the creation of the standing order.
   * @param {object} params - The Standing Order parameters.
   * @param {string} params.StandingOrderName - A unique name for the standing order for that customer (e.g., "Monthly Internet Bill").
   * @param {string} params.StartDate - The date for the first payment in `YYYYMMDD` format.
   * @param {string} params.EndDate - The date for the last payment in `YYYYMMDD` format.
   * @param {number} params.Amount - The amount to be deducted at each interval.
   * @param {string} params.PartyA - The customer's phone number in `2547XXXXXXXX` format.
   * @param {string} params.AccountReference - The account number for the payment (e.g., customer's account ID).
   * @param {string} params.CallBackURL - A secure URL on your server where Safaricom will send the final result.
   * @param {string} params.Frequency - The payment interval. '1' for One-Off, '2' for Daily, '3' for Weekly, '4' for Monthly, etc.
   * @param {string} [params.TransactionType='Standing Order Customer Pay Bill'] - The type of transaction. Can be 'Standing Order Customer Pay Bill' or 'Standing Order Customer Pay Marchant'.
   * @param {string} [params.TransactionDesc='Standing Order'] - A brief description of the payment.
   * @returns {Promise<object>} A promise that resolves with the initial acknowledgment from the API.
   * On success, this object contains:
   * - `ResponseHeader`: Contains metadata about the response.
   * - `ResponseBody`: Contains a success message indicating the request was accepted.
   * * The final result of the standing order creation will be sent asynchronously to your `CallBackURL`.
   */
  async createStandingOrder(params) {
    const endpoint = "/standingorder/v1/createStandingOrderExternal";
    const requestBody = {
      StandingOrderName: params.StandingOrderName,
      StartDate: params.StartDate,
      EndDate: params.EndDate,
      BusinessShortCode: this.shortCode,
      TransactionType:
        params.TransactionType || "Standing Order Customer Pay Bill",
      ReceiverPartyIdentifierType: "4", // '4' for Paybill, '2' for Till
      Amount: params.Amount,
      PartyA: params.PartyA,
      CallBackURL: params.CallBackURL,
      AccountReference: params.AccountReference,
      TransactionDesc: params.TransactionDesc || "Standing Order",
      Frequency: params.Frequency,
    };
    return this._makeRequest(endpoint, requestBody);
  }
}

export default Safaricom;
