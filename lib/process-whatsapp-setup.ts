/* eslint-disable @typescript-eslint/no-explicit-any */

import User from "@/models/User";
import {
  subscribeWhatsAppWaba,
} from "@/lib/subscribe-whatsapp-waba";
import {
  registerWhatsAppNumber,
} from "@/lib/register-whatsapp-number";

export async function processWhatsAppSetup(
  userId: string,
  phoneNumberId: string
) {
  const user =
    await User.findById(userId);

  if (!user) {
    throw new Error(
      "User not found."
    );
  }

  const numberIndex =
    user.whatsappNumbers.findIndex(
      (number: any) =>
        number.whatsappPhoneNumberId ===
        phoneNumberId
    );

  if (numberIndex === -1) {
    throw new Error(
      "WhatsApp number not found."
    );
  }

  const number: any =
    user.whatsappNumbers[numberIndex];

  try {
    /*
     * ========================================================
     * STEP 1
     * Check credit line
     * ========================================================
     *
     * THIS PART MUST BE CONNECTED TO PINBOT'S REAL API.
     *
     * Do not invent an endpoint here.
     *
     * For now we stop safely if the credit line hasn't been
     * confirmed.
     */

    if (
      number.creditLineStatus !==
      "READY"
    ) {
      number.setupStatus =
        "WAITING_CREDIT_LINE";

      number.nextSetupAttemptAt =
        new Date(
          Date.now() +
            4 * 60 * 1000
        );

      await user.save();

      return {
        success: false,
        waiting: true,
        reason:
          "Credit line is not ready yet.",
      };
    }

    /*
     * ========================================================
     * STEP 2
     * Subscribe WABA
     * ========================================================
     */

    number.setupStatus =
      "SUBSCRIBING";

    number.subscriptionStatus =
      "SUBSCRIBING";

    await user.save();

    await subscribeWhatsAppWaba({
      wabaId:
        number.wabaId,
      accessToken:
        number.whatsappAccessToken,
    });

    number.subscriptionStatus =
      "SUBSCRIBED";

    /*
     * ========================================================
     * STEP 3
     * Register phone number
     * ========================================================
     */

    number.setupStatus =
      "REGISTERING";

    number.registrationStatus =
      "REGISTERING";

    await user.save();

    /*
     * IMPORTANT:
     *
     * registrationPin should only contain an actual PIN
     * obtained through the appropriate registration flow.
     */

    await registerWhatsAppNumber({
      phoneNumberId:
        number.whatsappPhoneNumberId,

      accessToken:
        number.whatsappAccessToken,

      pin:
        number.registrationPin,
    });

    /*
     * ========================================================
     * STEP 4
     * Success
     * ========================================================
     */

    number.registrationStatus =
      "REGISTERED";

    number.setupStatus =
      "READY";

    number.registrationError =
      null;

    number.setupError =
      null;

    number.setupCompletedAt =
      new Date();

    number.nextSetupAttemptAt =
      null;

    await user.save();

    console.log(
      "[WhatsApp Setup] ✓ COMPLETE:",
      phoneNumberId
    );

    return {
      success: true,
      status: "READY",
    };
  } catch (error: any) {
    console.error(
      "[WhatsApp Setup] Failed:",
      error
    );

    number.setupStatus =
      "FAILED";

    number.registrationStatus =
      "FAILED";

    number.registrationError =
      error?.message ||
      "WhatsApp setup failed.";

    number.setupError =
      error?.message ||
      "WhatsApp setup failed.";

    number.nextSetupAttemptAt =
      new Date(
        Date.now() +
          5 * 60 * 1000
      );

    await user.save();

    return {
      success: false,
      status: "FAILED",
      error:
        error?.message ||
        "WhatsApp setup failed.",
    };
  }
}
