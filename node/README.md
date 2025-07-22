Safaricom Daraja NodeJS Library 🇰🇪
Karibu! This is a simple, modern, and powerful Node.js library for connecting your application to the Safaricom Daraja API.

Our goal is to make M-Pesa integrations as easy as possible. We handle the complicated parts like getting tokens and generating passwords, so you can focus on building your amazing application.

✨ Features
Easy to Use: We've simplified the official Daraja API so you can write less code.

Promise-Based: Uses modern async/await to make your code clean and easy to read.

Automatic Token Handling: The library automatically gets and renews your access token, so you don't have to worry about it expiring.

Smart Automation: Automatically generates the Timestamp and Password for STK Push and other requests.

Full API Coverage: Supports all major Daraja APIs, including:

M-Pesa Express (STK Push) & Query

Customer to Business (C2B)

Business to Customer (B2C)

Transaction Status

Account Balance

Reversals

Sandbox & Production: Easily switch between testing (sandbox) and live (production) modes.

📦 Installation
To get started, just install the package using npm:

Bash

npm install safaricom-daraja-nodejs
⚙️ Configuration
First, you need to set up the library with your app's credentials from the Safaricom Developer Portal.

JavaScript

import Safaricom from 'safaricom-daraja-nodejs';

const options = {
  consumerKey: 'YOUR_CONSUMER_KEY',
  consumerSecret: 'YOUR_CONSUMER_SECRET',
  shortCode: 'YOUR_PAYBILL_OR_TILL_NUMBER',
  passkey: 'YOUR_STK_PASSKEY', // Needed for STK Push
  initiatorName: 'YOUR_INITIATOR_NAME', // Needed for B2C, B2B, etc.
  securityCredential: 'YOUR_SECURITY_CREDENTIAL', // Needed for B2C, Reversals, etc.
  environment: 'sandbox' // 'sandbox' or 'production'
};

const safaricom = new Safaricom(options);
Why do we need this?
These options tell the library who you are and how to talk to the Daraja API on your behalf.

consumerKey & consumerSecret: These are like your app's username and password.

shortCode: This is your Paybill or Till Number.

passkey, initiatorName, securityCredential: These are special credentials required for specific APIs. The library will tell you if you forget to add one when you need it.

environment: This lets you switch between the free sandbox for testing and production when you are ready to go live.

🚀 Usage Examples
All API methods return a Promise, so it's best to use async/await inside a try...catch block to handle any potential errors.

1. M-Pesa Express (STK Push)
This asks a customer to enter their M-Pesa PIN to pay. A prompt will appear on their phone.

JavaScript

async function startStkPush() {
  try {
    const response = await safaricom.stkPush({
      Amount: 1,
      PhoneNumber: '2547XXXXXXXX', // The customer's phone number
      CallBackURL: 'https://mydomain.com/callback',
      AccountReference: 'Order-123',
      TransactionDesc: 'Payment for an order'
    });
    console.log(response);
  } catch (error) {
    console.error(error);
  }
}

startStkPush();
Why is this simple?
You only provide the important details. The library automatically creates the Timestamp and Password for you.

2. M-Pesa Express Query
This checks the status of an STK Push you started earlier.

JavaScript

async function checkStkStatus() {
  try {
    const response = await safaricom.stkQuery({
      CheckoutRequestID: 'ws_CO_XXXXXXXXXXXXXXXXXXXX' // The ID you got from the stkPush response
    });
    console.log(response);
  } catch (error) {
    console.error(error);
  }
}

checkStkStatus();
3. Customer to Business (C2B) - Register URL
This tells M-Pesa where to send notifications when a customer pays you. You only need to do this once.

JavaScript

async function registerUrls() {
  try {
    const response = await safaricom.c2bRegister({
      ConfirmationURL: 'https://mydomain.com/confirmation',
      ValidationURL: 'https://mydomain.com/validation'
    });
    console.log(response);
  } catch (error) {
    console.error(error);
  }
}

registerUrls();
4. Business to Customer (B2C)
This sends money from your business account to a customer (e.g., for a refund or a salary payment).

JavaScript

async function sendToCustomer() {
  try {
    const response = await safaricom.b2c({
      Amount: 100,
      PartyB: '2547XXXXXXXX', // The customer's phone number
      Remarks: 'Refund for Order-123',
      QueueTimeOutURL: 'https://mydomain.com/b2c/queue',
      ResultURL: 'https://mydomain.com/b2c/result'
    });
    console.log(response);
  } catch (error) {
    console.error(error);
  }
}

sendToCustomer();
Heads up! For this to work, you must provide the initiatorName and securityCredential in the main configuration.

5. Transaction Status
This checks the status of any M-Pesa transaction (like C2B or B2C).

JavaScript

async function checkTransaction() {
  try {
    const response = await safaricom.transactionStatus({
      TransactionID: 'Oxxxxxxxxxxx', // The M-Pesa Transaction ID
      ResultURL: 'https://mydomain.com/transaction/result',
      QueueTimeOutURL: 'https://mydomain.com/transaction/queue'
    });
    console.log(response);
  } catch (error) {
    console.error(error);
  }
}

checkTransaction();
6. Account Balance
This checks the balance of your M-Pesa shortcode.

JavaScript

async function checkBalance() {
  try {
    const response = await safaricom.accountBalance({
      ResultURL: 'https://mydomain.com/balance/result',
      QueueTimeOutURL: 'https://mydomain.com/balance/queue'
    });
    console.log(response);
  } catch (error) {
    console.error(error);
  }
}

checkBalance();
7. Reversal
This sends money back to a customer for a transaction that you want to reverse.

JavaScript

async function reverseTransaction() {
  try {
    const response = await safaricom.reversal({
      TransactionID: 'Oxxxxxxxxxxx',
      Amount: 100,
      ResultURL: 'https://mydomain.com/reversal/result',
      QueueTimeOutURL: 'https://mydomain.com/reversal/queue',
      Remarks: 'Wrong transaction'
    });
    console.log(response);
  } catch (error) {
    console.error(error);
  }
}

reverseTransaction();
🛡️ Error Handling
The Daraja API can sometimes return errors. Our library makes it easy to handle them. If something goes wrong, the library will throw an error. Just wrap your calls in a try...catch block to catch them gracefully.

JavaScript

try {
  // Your API call here
  const response = await safaricom.stkPush({...});
} catch (error) {
  // If anything goes wrong, it will be caught here
  console.error("Oops, something went wrong:", error.message);
}
This makes your application stable and helps you understand what went wrong if a payment fails.

Happy Coding! 🎉