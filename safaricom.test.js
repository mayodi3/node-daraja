import axios from "axios";
import Safaricom from "./index.js";

// Mock axios to avoid actual network calls
jest.mock("axios");

const mockOptions = {
  consumerKey: "test_key",
  consumerSecret: "test_secret",
  shortCode: "600988",
  passkey: "test_passkey",
  initiatorName: "test_initiator",
  securityCredential: "test_credential",
  environment: "sandbox",
};

describe("Safaricom Library", () => {
  let safaricom;

  // A fixed timestamp for predictable password generation in tests
  const fixedTimestamp = "20230101000000";

  beforeEach(() => {
    safaricom = new Safaricom(mockOptions);

    // Mock the internal _getTimestamp method to return a fixed value
    // This makes testing password generation predictable
    jest.spyOn(safaricom, "_getTimestamp").mockReturnValue(fixedTimestamp);

    // Reset axios mocks before each test
    axios.get.mockReset();
    axios.post.mockReset();

    // Mock the auth token for all API calls
    const mockTokenResponse = {
      data: { access_token: "api_token", expires_in: 3599 },
    };
    axios.get.mockResolvedValue(mockTokenResponse);
  });

  afterEach(() => {
    // Restore original methods
    jest.restoreAllMocks();
  });

  describe("Initialization", () => {
    it("should throw an error if required options are missing", () => {
      expect(() => new Safaricom({})).toThrow(
        "Consumer key, consumer secret, and shortcode are required."
      );
    });

    it("should throw an error for an invalid environment", () => {
      expect(
        () => new Safaricom({ ...mockOptions, environment: "invalid" })
      ).toThrow(
        "Invalid environment specified: invalid. Use 'sandbox' or 'production'."
      );
    });
  });

  describe("STK Push & Query", () => {
    it("should throw an error if passkey is missing for stkPush", async () => {
      const safaricomWithoutPasskey = new Safaricom({
        ...mockOptions,
        passkey: undefined,
      });
      await expect(safaricomWithoutPasskey.stkPush({})).rejects.toThrow(
        "Passkey is required for STK Push."
      );
    });

    it("should automatically generate Password and Timestamp for stkPush", async () => {
      axios.post.mockResolvedValue({ data: { message: "Success" } });

      await safaricom.stkPush({
        Amount: 1,
        PhoneNumber: "254712345678",
        CallBackURL: "https://test.com/callback",
        AccountReference: "Test-Ref",
        TransactionDesc: "Test Desc",
      });

      const expectedPassword = Buffer.from(
        mockOptions.shortCode + mockOptions.passkey + fixedTimestamp
      ).toString("base64");

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          Password: expectedPassword,
          Timestamp: fixedTimestamp,
          BusinessShortCode: mockOptions.shortCode,
        }),
        expect.any(Object)
      );
    });
  });

  describe("B2C", () => {
    it("should throw an error if initiatorName is missing for b2c", async () => {
      const safaricomWithoutInitiator = new Safaricom({
        ...mockOptions,
        initiatorName: undefined,
      });
      await expect(safaricomWithoutInitiator.b2c({})).rejects.toThrow(
        "InitiatorName and SecurityCredential are required for B2C transactions."
      );
    });

    it("should throw an error if securityCredential is missing for b2c", async () => {
      const safaricomWithoutCredential = new Safaricom({
        ...mockOptions,
        securityCredential: undefined,
      });
      await expect(safaricomWithoutCredential.b2c({})).rejects.toThrow(
        "InitiatorName and SecurityCredential are required for B2C transactions."
      );
    });

    it("should correctly build the B2C request body", async () => {
      axios.post.mockResolvedValue({ data: { message: "Success" } });

      await safaricom.b2c({
        Amount: 100,
        PartyB: "254712345678",
        Remarks: "Test B2C",
        QueueTimeOutURL: "https://test.com/queue",
        ResultURL: "https://test.com/result",
      });

      expect(axios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          InitiatorName: mockOptions.initiatorName,
          SecurityCredential: mockOptions.securityCredential,
          PartyA: mockOptions.shortCode,
          Amount: 100,
          PartyB: "254712345678",
        }),
        expect.any(Object)
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle API errors gracefully", async () => {
      const errorResponse = {
        response: {
          status: 400,
          data: { errorMessage: "Invalid request" },
        },
      };
      axios.post.mockRejectedValue(errorResponse);

      await expect(
        safaricom.stkPush({
          Amount: 1,
          PhoneNumber: "254712345678",
          CallBackURL: "https://test.com/callback",
          AccountReference: "Test-Ref",
          TransactionDesc: "Test Desc",
        })
      ).rejects.toThrow("API request failed with status 400: Invalid request");
    });
  });
});
