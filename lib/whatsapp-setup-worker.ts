/* eslint-disable @typescript-eslint/no-explicit-any */

import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import {
  processWhatsAppSetup,
} from "@/lib/process-whatsapp-setup";

let running = false;

export async function runWhatsAppSetupWorker() {
  if (running) {
    console.log(
      "[WhatsApp Worker] Already running."
    );

    return;
  }

  running = true;

  try {
    await connectDB();

    const now = new Date();

    const users =
      await User.find({
        whatsappNumbers: {
          $elemMatch: {
            setupStatus: {
              $in: [
                "WAITING_CREDIT_LINE",
                "PROCESSING",
                "FAILED",
              ],
            },

            $or: [
              {
                nextSetupAttemptAt: {
                  $lte: now,
                },
              },
              {
                nextSetupAttemptAt:
                  null,
              },
            ],
          },
        },
      })
        .limit(20);

    console.log(
      `[WhatsApp Worker] Found ${users.length} users.`
    );

    for (const user of users) {
      const numbers =
        user.whatsappNumbers || [];

      for (const number of numbers) {
        if (
          ![
            "WAITING_CREDIT_LINE",
            "PROCESSING",
            "FAILED",
          ].includes(
            number.setupStatus
          )
        ) {
          continue;
        }

        if (
          number.nextSetupAttemptAt &&
          new Date(
            number.nextSetupAttemptAt
          ) > now
        ) {
          continue;
        }

        const phoneId = number.whatsappPhoneNumberId;

        if (!phoneId || typeof phoneId !== "string") {
          console.warn(
            `[WhatsApp Worker] Skipping number for user ${user._id} due to missing whatsappPhoneNumberId.`
          );
          continue;
        }

        await processWhatsAppSetup(
          user._id.toString(),
          phoneId
        );
      }
    }
  } catch (error) {
    console.error(
      "[WhatsApp Worker] ERROR:",
      error
    );
  } finally {
    running = false;
  }
}
