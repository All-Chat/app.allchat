/* eslint-disable @typescript-eslint/no-explicit-any */

import "dotenv/config";

import { connectDB } from "../lib/mongodb";
import User from "../models/User";
import {
  completeWhatsAppSetup,
} from "../lib/whatsappSetup";

const interval =
  Number(
    process.env.WHATSAPP_SETUP_WORKER_INTERVAL
  ) || 30000;

let isRunning = false;

async function processPendingNumbers() {
  if (isRunning) {
    return;
  }

  isRunning = true;

  try {
    await connectDB();

    const now =
      new Date();

    /*
     * Find users having numbers whose
     * 4-minute waiting period is finished.
     */

    const users =
      await User.find({
        whatsappNumbers: {
          $elemMatch: {
            setupStatus:
              "WAITING_CREDIT_LINE",

            nextSetupAttemptAt: {
              $lte: now,
            },
          },
        },
      }).limit(10);

    if (!users.length) {
      return;
    }

    console.log(
      `[WhatsApp Worker] Found ${users.length} user(s)`
    );

    for (
      const user of users
    ) {
      const numbers =
        Array.isArray(
          user.whatsappNumbers
        )
          ? user.whatsappNumbers
          : [];

      for (
        const number of numbers
      ) {
        const numberData = number as any;

        /*
         * Only process waiting numbers.
         */

        if (
          numberData.setupStatus !==
          "WAITING_CREDIT_LINE"
        ) {
          continue;
        }

        /*
         * Check waiting time.
         */

        if (
          numberData.nextSetupAttemptAt &&
          new Date(
            numberData.nextSetupAttemptAt
          ) > now
        ) {
          continue;
        }

        const userId =
          user._id.toString();

        const phoneNumberId =
          numberData.whatsappPhoneNumberId;

        const wabaId =
          numberData.wabaId;

        const businessId =
          numberData.businessId;

        if (
          !phoneNumberId ||
          !wabaId ||
          !businessId
        ) {
          console.error(
            "[WhatsApp Worker] Missing required data:",
            {
              userId,
              phoneNumberId,
              wabaId,
              businessId,
            }
          );

          continue;
        }

        /*
         * Mark as PROCESSING before starting.
         */

        await User.updateOne(
          {
            _id:
              user._id,

            "whatsappNumbers.whatsappPhoneNumberId":
              phoneNumberId,

            "whatsappNumbers.setupStatus":
              "WAITING_CREDIT_LINE",
          },

          {
            $set: {
              "whatsappNumbers.$.setupStatus":
                "PROCESSING",
            },
          }
        );

        /*
         * Process the entire setup.
         */

        try {
          console.log(
            "[WhatsApp Worker] --------------------------------"
          );

          console.log(
            "[WhatsApp Worker] Processing:",
            phoneNumberId
          );

          console.log(
            "[WhatsApp Worker] WABA:",
            wabaId
          );

          console.log(
            "[WhatsApp Worker] Business:",
            businessId
          );

          await completeWhatsAppSetup({
            userId,

            phoneNumberId,

            wabaId,

            businessId,
          });

          console.log(
            "[WhatsApp Worker] ✓ COMPLETE:",
            phoneNumberId
          );

          console.log(
            "[WhatsApp Worker] --------------------------------"
          );
        } catch (error: any) {
          console.error(
            "[WhatsApp Worker] FAILED:",
            phoneNumberId
          );

          console.error(
            error
          );

          /*
           * Retry after 60 seconds.
           */

          await User.updateOne(
            {
              _id:
                user._id,

              "whatsappNumbers.whatsappPhoneNumberId":
                phoneNumberId,
            },

            {
              $set: {
                "whatsappNumbers.$.setupStatus":
                  "WAITING_CREDIT_LINE",

                "whatsappNumbers.$.setupError":
                  error?.message ||
                  "Setup failed.",

                "whatsappNumbers.$.nextSetupAttemptAt":
                  new Date(
                    Date.now() +
                      60 *
                        1000
                  ),
              },
            }
          );
        }
      }
    }
  } catch (error) {
    console.error(
      "[WhatsApp Worker] General error:",
      error
    );
  } finally {
    isRunning =
      false;
  }
}

async function start() {
  console.log(
    "================================================"
  );

  console.log(
    "ALLCHAT WHATSAPP SETUP WORKER"
  );

  console.log(
    "================================================"
  );

  console.log(
    "Redis: DISABLED"
  );

  console.log(
    `Interval: ${interval}ms`
  );

  console.log(
    "================================================"
  );

  /*
   * Run immediately.
   */

  await processPendingNumbers();

  /*
   * Then every 30 seconds.
   */

  setInterval(
    processPendingNumbers,
    interval
  );
}

start().catch(
  (error) => {
    console.error(
      "[WhatsApp Worker] Fatal error:",
      error
    );

    process.exit(1);
  }
);
