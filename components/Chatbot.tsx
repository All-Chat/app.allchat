/* eslint-disable @next/next/no-img-element */
/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useState, useRef, useEffect } from 'react';

// --- AllChat DOCUMENTATION KNOWLEDGE BASE ---
const rawDocumentation = `
AllChat is a WhatsApp communication, automation, campaign, and customer management platform designed to help businesses manage their WhatsApp communication from a single dashboard. AllChat allows businesses to connect WhatsApp Business accounts, manage conversations, create and use WhatsApp templates, send individual test messages, run bulk campaigns, create automated workflows, manage tags, collect customer information through forms, view reports, synchronize information with Google Sheets, and manage account billing and balance.

AllChat is organized into multiple major sections including Dashboard, Messaging, Campaigns, Automation, Reports & Sheets, Transactions, and Settings. The exact features available to a user can depend on their account configuration and connected WhatsApp Business account.

DASHBOARD:
The AllChat Dashboard provides an overview of the business WhatsApp account and its activity. The dashboard can display information such as connected WhatsApp numbers, WhatsApp number status, account balance, recharge information, messaging activity, campaign activity, and other important account-level information.

The Dashboard is intended to provide a quick overview of the current state of the AllChat account without requiring the user to open each individual section.

WHATSAPP NUMBER CONNECTION:
Businesses can connect their WhatsApp Business Account and WhatsApp phone number to AllChat through the WhatsApp onboarding process.

To connect a WhatsApp Number:
Go to Settings -> WhatsApp Numbers.

AllChat uses Meta's WhatsApp onboarding and Embedded Signup flow to allow businesses to connect their WhatsApp Business Account. During the onboarding process, the business may be required to log in with its Meta account, select or create the appropriate business assets, select a WhatsApp Business Account, select a phone number, and complete the required Meta onboarding steps.

After a WhatsApp number has been successfully connected, it can be used for messaging, templates, test messages, campaigns, and automation depending on the number's status and configuration.

If a WhatsApp number is not visible or cannot be connected, the user should check whether the number is eligible for WhatsApp Business onboarding, whether the correct Meta Business account is being used, and whether the WhatsApp Business Account has been configured correctly.

WHATSAPP NUMBER STATUS:
Connected WhatsApp numbers may have different statuses depending on their configuration and Meta account state.

When troubleshooting a WhatsApp number, check:
1. Whether the number is connected to AllChat.
2. Whether the WhatsApp Business Account is correctly connected.
3. Whether the phone number is active.
4. Whether the number is registered correctly.
5. Whether the number has any restrictions.
6. Whether the correct WhatsApp Business Account is being used.
7. Whether the number is available for sending messages.

If a number is connected but messages cannot be sent, the user should first check the number status, template status, recipient number, account balance, and any error displayed by the system.

MESSAGING:
The Messaging section is used for managing WhatsApp conversations, templates, test messages, and test message reports.

Messaging contains:
- Live Chat
- Create Template
- View Templates
- Send Test Message
- Test Message Report

LIVE CHAT:
Live Chat allows team members to manage incoming WhatsApp conversations and communicate directly with customers.

To use Live Chat:
Go to Messaging -> Live Chat.

Select the required WhatsApp number, search for the customer, open the customer's conversation, review previous messages, and send a reply.

Live Chat is primarily used for handling customer conversations manually. Team members can use it to respond to incoming customers, continue existing conversations, and manage customer communication from the AllChat dashboard.

If a customer conversation cannot be found, check that the correct WhatsApp number is selected and search using the customer's phone number or available customer information.

WHATSAPP TEMPLATES:
WhatsApp templates are pre-approved message formats used for outbound WhatsApp communication. Templates are especially important when businesses need to initiate conversations with customers or send messages outside the applicable customer-service conversation window.

A WhatsApp template can contain:
- Template name
- Category
- Language
- Header
- Body
- Footer
- Buttons
- Variables

The template body contains the main message. Variables allow dynamic information to be inserted into the message, such as customer names, order information, dates, amounts, links, or other supported values.

Templates must follow WhatsApp and Meta's template policies and must be approved before they can be used for applicable outbound messaging.

CREATE TEMPLATE:
To create a WhatsApp template:
Go to Messaging -> Create Template.

The general process is:
1. Enter a template name.
2. Select the appropriate category.
3. Select the required language.
4. Enter the message body.
5. Add variables if required.
6. Add a header if required.
7. Add a footer if required.
8. Add supported buttons if required.
9. Review the template.
10. Submit the template for approval.

Template names should be meaningful and easy to identify later. Businesses should avoid creating unnecessary duplicate templates.

TEMPLATE VARIABLES:
Variables are placeholders inside a template that are replaced with dynamic values when the message is sent.

For example, a template may contain:
Hello {{1}}, your order {{2}} has been confirmed.

When sending the message, the variables can be replaced with actual values such as:
Hello Rahul, your order ORD123 has been confirmed.

When a template contains variables, the number and order of variables must match the values supplied when sending the message.

If a message fails because of variables, check:
1. Whether all required variables are provided.
2. Whether variables are provided in the correct order.
3. Whether any required variable is empty.
4. Whether the template selected is the correct template.
5. Whether the template structure matches the approved template.

VIEW TEMPLATES:
To view existing templates:
Go to Messaging -> View Templates.

The template list allows users to search for templates, view template names, check template categories, check template status, and preview templates.

A template may have different statuses depending on the Meta approval state and AllChat synchronization state.

Before using a template in a campaign or test message, verify that the template exists, belongs to the correct WhatsApp Business Account, uses the correct language, and is approved and available for use.

If a template is missing:
1. Search using the exact template name.
2. Check the selected WhatsApp number.
3. Check whether the template belongs to the connected WhatsApp Business Account.
4. Check whether the template has been approved.
5. Check whether the template has been synchronized correctly.

SEND TEST MESSAGE:
Send Test Message allows a business to test a WhatsApp template before using it in a larger campaign.

To send a test message:
Go to Messaging -> Send Test Message.

The general process is:
1. Select the WhatsApp number.
2. Enter the recipient phone number.
3. Select an approved template.
4. Enter values for template variables.
5. Review the message.
6. Send the test message.
7. Check the Test Message Report for the result.

Testing a template before a campaign is recommended because it allows the business to identify template, variable, recipient, or configuration problems before sending messages to a larger audience.

If a test message fails:
1. Check the recipient phone number.
2. Check the selected WhatsApp number.
3. Check whether the template is approved.
4. Check whether all template variables have valid values.
5. Check the error message returned by the system.
6. Check whether the account has sufficient balance if billing is applicable.

TEST MESSAGE REPORT:
To view test message results:
Go to Messaging -> Test Message Report.

The report provides information about test message delivery and status.

Common message states include:
- Sent
- Delivered
- Read
- Failed

Sent generally indicates that the message has been accepted for sending.

Delivered indicates that WhatsApp has reported delivery to the recipient's device.

Read indicates that the recipient has opened or read the message when read status is available.

Failed indicates that the message could not be sent or delivered successfully.

If a message remains in a particular state for some time, check the recipient number, WhatsApp number status, template status, and available error information.

CAMPAIGNS:
Campaigns allow businesses to send WhatsApp templates to multiple recipients.

The Campaign section includes:
- Create Campaign
- Campaigns / Campaign List
- Campaign Reports
- Sheet Campaigns

Campaigns are designed for bulk or audience-based WhatsApp communication.

Before launching a campaign, businesses should verify the selected WhatsApp number, template, recipient audience, variables, and campaign configuration.

CREATE CAMPAIGN:
To create a campaign:
Go to Campaigns -> Create Campaign.

The campaign creation process generally includes:
1. Enter campaign information.
2. Select the WhatsApp number.
3. Select the template.
4. Select the audience source.
5. Review recipients.
6. Configure template variables.
7. Review the campaign.
8. Launch the campaign.

Supported audience sources can include:
- Tags
- Excel files
- CSV files
- Manual phone numbers
- Google Sheets

The exact options available may depend on the account and implementation.

AUDIENCE SOURCES:
Tags can be used to select customers belonging to a particular customer segment.

Excel and CSV files can be used when the business has a prepared list of customer phone numbers and related information.

Manual numbers allow the business to provide recipient phone numbers directly.

Google Sheets can be used when customer or campaign data is maintained in a Google Sheet connected to AllChat.

Before launching a campaign, always review the final recipient list to reduce the risk of sending messages to incorrect, duplicate, or unintended recipients.

CAMPAIGN VARIABLES:
If the selected WhatsApp template contains variables, campaign data must provide the required values.

For example, if the template contains:
Hello {{1}}, your appointment is scheduled for {{2}}.

The campaign data should contain the customer name and appointment date.

If variable information is missing or incorrectly mapped, campaign messages may fail or contain incorrect information.

CAMPAIGN LIST:
To view existing campaigns:
Go to Campaigns -> Campaigns.

The Campaign List provides an overview of campaigns.

Campaign information can include:
- Campaign name
- Creation date
- Message count
- Sent messages
- Delivered messages
- Pending messages
- Failed messages
- Campaign status

The campaign list is useful for quickly checking the overall progress and status of campaigns.

CAMPAIGN REPORTS:
To view detailed campaign results:
Go to Campaigns -> Campaign Reports.

Campaign Reports provide message-level or campaign-level delivery information.

Common campaign report statuses include:
- Replied
- Read
- Delivered
- Sent
- Pending
- Failed
- Invalid
- Duplicate

Replied indicates that a customer has responded to the message.

Read indicates that the message has been read when read information is available.

Delivered indicates successful delivery to the recipient.

Sent indicates that the message was accepted for sending.

Pending indicates that processing or delivery is still in progress.

Failed indicates that the message could not be sent successfully.

Invalid generally indicates that the recipient or message information is invalid.

Duplicate indicates that the recipient or record was detected as a duplicate according to the campaign processing rules.

If campaign messages fail, review the failed records and check the recipient number, template, template variables, WhatsApp number status, and error information.

SHEET CAMPAIGNS:
Sheet Campaigns allow businesses to use Google Sheets data as a campaign audience.

This is useful when customer information is maintained in a spreadsheet and the business wants to use that information directly for campaign processing.

Before using a Sheet Campaign, verify:
1. The correct Google Sheet is connected.
2. The correct sheet/tab is selected.
3. Required columns are available.
4. Phone numbers are valid.
5. Required template variables are available.
6. Duplicate or invalid records are reviewed.

AUTOMATION:
The Automation section allows businesses to create automated WhatsApp communication workflows.

Automation includes:
- Workflows
- Create Workflow
- Tags
- Opt-out Numbers
- Forms

WORKFLOWS:
A workflow is an automated sequence of actions that runs based on a defined trigger.

A workflow can automatically perform actions such as sending messages, waiting for a period, applying tags, calling customers, collecting information through forms, or performing other supported actions.

Workflow components can include:
- Trigger
- Message
- URL Button
- Call Action
- Delay
- Inactivity
- Tag Action
- Opt-out Action
- Form Action

TRIGGER:
A Trigger determines when a workflow should start.

The exact triggers available can depend on the AllChat implementation.

A trigger can initiate the workflow when a supported event occurs, such as a customer interaction or another configured event.

MESSAGE NODE:
The Message Node sends a WhatsApp message to the customer.

A message node can be used to send supported WhatsApp content or templates according to the workflow configuration.

When configuring a message node, verify the selected message/template, required variables, and recipient context.

URL BUTTON:
The URL Button allows a customer to open a web link from a WhatsApp message.

URL buttons are useful for directing customers to:
- Websites
- Landing pages
- Forms
- Product pages
- Booking pages
- Payment pages
- Other supported web destinations

The URL should be reviewed before activating the workflow to make sure customers are directed to the intended destination.

CALL ACTION:
Call Action allows a workflow to initiate or provide a phone-call action for the customer depending on the configured implementation.

This can be useful when customers need to contact a business directly instead of continuing through WhatsApp.

DELAY:
The Delay node pauses workflow execution for a configured period.

Delay can be used to prevent messages from being sent immediately after a previous action.

For example, a workflow can send one message, wait for a defined period, and then continue to another action.

INACTIVITY:
The Inactivity node allows a workflow to continue when a customer does not respond within a configured period.

This can be useful for follow-up communication.

For example:
1. Send a message.
2. Wait for customer response.
3. If the customer does not respond for the configured period, continue the workflow.

TAG ACTION:
Tag Action applies a tag to a customer automatically during workflow execution.

Tags can be used to categorize and segment customers.

Examples of tags include:
- Interested
- VIP
- Lead
- Follow-up
- Customer
- Purchase Completed

Tags can later be used for audience segmentation and campaign targeting.

OPT-OUT ACTION:
Opt-out Action can be used to prevent or manage automated communication for customers who do not want to receive further automated messages.

Businesses should respect customer opt-out requests and keep their opt-out information updated.

FORM ACTION:
Form Action presents a form to a customer as part of a workflow.

Forms can be used to collect customer information such as:
- Name
- Phone number
- Email
- Address
- Preferences
- Other business-specific information

Form responses can be reviewed from:
Reports & Sheets -> Form Responses.

CREATE WORKFLOW:
To create a workflow:
Go to Automation -> Create Workflow.

The general workflow creation process is:
1. Create a new workflow.
2. Define the workflow name.
3. Configure the trigger.
4. Add required action nodes.
5. Configure each node.
6. Connect the nodes.
7. Review the workflow.
8. Test the workflow where supported.
9. Activate the workflow.

Before activating a workflow, verify that the trigger, message content, variables, delays, conditions, tags, forms, and other actions are configured correctly.

TAGS:
Tags allow businesses to categorize and segment customers.

Examples:
- Interested
- VIP
- Lead
- New Customer
- Existing Customer
- Follow-up Required

Tags can be manually assigned or automatically assigned through workflows.

Tags can also be used as an audience source for campaigns.

To manage tags:
Go to Automation -> Tags.

OPT-OUT NUMBERS:
Opt-out numbers are customers who have requested not to receive automated communication.

To view opt-out numbers:
Go to Automation -> Opt-out Numbers.

Opt-out data should be kept updated and should be considered when preparing campaign audiences and automated communication.

Businesses should avoid sending unwanted automated communication to customers who have opted out.

FORMS:
Forms allow businesses to collect customer information through WhatsApp workflows.

To manage forms:
Go to Automation -> Forms.

A form can contain multiple fields depending on the business requirement.

Forms can be used for:
- Lead collection
- Customer information
- Enquiries
- Booking information
- Feedback
- Registration
- Qualification
- Other business processes

FORM RESPONSES:
Form responses can be viewed from:
Reports & Sheets -> Form Responses.

Form Responses allow businesses to review information submitted by customers through workflow forms.

GOOGLE SHEETS INTEGRATION:
AllChat can integrate with Google Sheets to exchange and maintain campaign, customer, form, and reporting information.

To manage integrations:
Go to Settings -> Integrations.

Google Sheets integration can be used for:
- Campaign audiences
- Campaign reporting
- Customer information
- Form responses
- Data synchronization

SHEET SYNCHRONIZATION:
Sheet Synchronization allows AllChat and Google Sheets to exchange supported information.

Depending on the configuration, synchronized information may include:
- Customer information
- Campaign results
- Message status
- Form responses
- Other supported reporting information

When synchronization is not working, check that:
1. The Google account is connected.
2. The correct Google Sheet is selected.
3. The required permissions are available.
4. The selected sheet/tab exists.
5. Required columns are present.
6. The integration is still active.

SHEET REPORTS:
Sheet Reports allow campaign reporting information to be maintained inside Google Sheets.

To access Sheet Reports:
Go to Reports & Sheets -> Sheet Reports.

Sheet Reports are useful for businesses that want to maintain campaign reporting data in spreadsheet format for analysis, sharing, or internal reporting.

REPORTS & SHEETS:
The Reports & Sheets section contains reporting and spreadsheet-related information.

It can include:
- Campaign Reports
- Form Responses
- Sheet Reports
- Other supported reporting features

Reports should be reviewed regularly to understand campaign performance, delivery status, failures, customer responses, and other communication activity.

TRANSACTIONS:
Transactions provide visibility into account balance activity.

Transaction information can include:
- Balance
- Recharge
- Spent amount
- Transaction date
- Transaction status
- Other supported billing information

Transactions help businesses understand how their AllChat account balance is being used.

BILLING & BALANCE:
To view account billing and balance:
Go to Transactions -> Billing & Balance.

Billing & Balance can show:
- Available balance
- Total amount recharged
- Total amount spent

The available balance represents the amount currently available for applicable paid activity.

If a campaign or message cannot be processed because of insufficient balance, check the Billing & Balance section and recharge the account if required.

RECHARGE:
Businesses can add balance to their AllChat account through the supported recharge process.

After a recharge, the balance and transaction information should update according to the system's processing.

If a recharge does not appear immediately, check the transaction status and recharge history before attempting another payment.

RECHARGE HISTORY:
To view previous recharge activity:
Go to Settings -> Recharge History.

Recharge History can show:
- Recharge amount
- Recharge date
- Transaction status
- Previous recharge activity

If a recharge is missing, check the payment status and transaction information.

SETTINGS:
The Settings section contains account and integration configuration options.

Settings can include:
- WhatsApp Numbers
- Billing & Balance
- Recharge History
- Integrations
- Other account configuration options

WhatsApp Numbers is used to manage connected WhatsApp numbers.

Billing & Balance is used to view available account balance and billing information.

Recharge History is used to review previous recharge transactions.

Integrations is used to manage connected services such as Google Sheets.

TROUBLESHOOTING - TEMPLATE NOT AVAILABLE:
If a template is not available:
1. Check whether the template exists.
2. Search using the correct template name.
3. Check the selected WhatsApp number.
4. Check whether the template belongs to the correct WhatsApp Business Account.
5. Check the template approval status.
6. Check the template language.
7. Check whether the template has synchronized correctly.

TROUBLESHOOTING - TEST MESSAGE FAILED:
If a test message fails:
1. Verify the recipient phone number.
2. Verify the WhatsApp number selected in AllChat.
3. Verify that the template is approved.
4. Verify all template variables.
5. Check whether the recipient number is valid.
6. Check the available account balance.
7. Review the error message returned by the system.
8. If the problem continues, verify the WhatsApp Business Account and phone number configuration.

TROUBLESHOOTING - CAMPAIGN FAILED:
If campaign messages fail:
1. Open Campaign Reports.
2. Identify the failed records.
3. Check recipient phone numbers.
4. Check whether the template is approved.
5. Check template variables.
6. Check the connected WhatsApp number.
7. Check the campaign audience.
8. Check account balance.
9. Review the error information available for failed messages.

TROUBLESHOOTING - CAMPAIGN NOT SENDING:
If a campaign is created but messages are not being processed:
1. Check campaign status.
2. Check whether the campaign is paused or still processing.
3. Check the selected WhatsApp number.
4. Check template availability.
5. Check recipient data.
6. Check account balance.
7. Check whether the campaign contains valid recipients.
8. Review Campaign Reports for failures or pending records.

TROUBLESHOOTING - INVALID NUMBERS:
If recipients are marked as invalid:
1. Check that phone numbers contain the correct country code.
2. Remove unnecessary spaces or unsupported characters.
3. Check for incomplete phone numbers.
4. Check whether the number belongs to the intended recipient.
5. Review the campaign data source for incorrect formatting.

TROUBLESHOOTING - DUPLICATE NUMBERS:
If campaign records are marked as duplicate:
1. Review the audience source.
2. Check whether the same phone number appears multiple times.
3. Remove duplicate records where necessary.
4. Re-upload or update the audience data if required.

TROUBLESHOOTING - WORKFLOW NOT RUNNING:
If a workflow is not running:
1. Check whether the workflow is activated.
2. Check the trigger configuration.
3. Check whether the triggering event actually occurred.
4. Check each connected node.
5. Check message/template configuration.
6. Check required variables.
7. Check delays and inactivity settings.
8. Check whether the customer is opted out.
9. Review any available workflow execution information.

TROUBLESHOOTING - FORM NOT WORKING:
If a form does not work:
1. Check whether the form exists.
2. Check whether the form is configured correctly.
3. Check the Form Action in the workflow.
4. Check whether the workflow is active.
5. Check the form fields.
6. Check whether the customer can access the form.
7. Check Form Responses after submission.

TROUBLESHOOTING - GOOGLE SHEETS NOT SYNCHRONIZING:
If Google Sheets data is not synchronizing:
1. Go to Settings -> Integrations.
2. Check whether Google Sheets is connected.
3. Check the connected Google account.
4. Verify the selected spreadsheet.
5. Verify the selected sheet/tab.
6. Verify required columns.
7. Check whether permissions are still valid.
8. Reconnect the integration if necessary.
9. Check whether synchronization is currently processing.

TROUBLESHOOTING - BALANCE ISSUE:
If the account balance appears incorrect:
1. Go to Transactions -> Billing & Balance.
2. Check the available balance.
3. Open Recharge History.
4. Check recent recharge transactions.
5. Check transaction status.
6. Compare recharge and spending activity.
7. If the transaction status does not match the expected result, contact AllChat support.

BEST PRACTICES - WHATSAPP TEMPLATES:
Always test a template before using it in a large campaign.

Use meaningful template names so templates can be identified easily.

Keep template content clear and relevant to the intended communication.

Make sure variables are correctly configured and mapped.

Do not assume a template is available immediately after creation. Check its approval and availability status before using it.

BEST PRACTICES - CAMPAIGNS:
Always review the audience before launching a campaign.

Use meaningful campaign names.

Verify the selected WhatsApp number.

Verify the selected template.

Verify all template variables.

Check for duplicate and invalid phone numbers.

Review campaign reports after sending.

Monitor failed and pending messages.

Avoid sending campaigns to customers who should not receive automated communication.

BEST PRACTICES - TAGS:
Use meaningful and consistent tag names.

Avoid creating many duplicate tags with slightly different names.

Use tags to create clear customer segments.

Examples include:
Interested
Lead
VIP
Existing Customer
Follow-up
Purchase Completed

BEST PRACTICES - WORKFLOWS:
Keep workflows simple and easy to understand.

Use meaningful workflow names.

Test workflows before activation.

Check every node and connection.

Verify message content and variables.

Use delays where appropriate.

Keep opt-out handling in mind.

Review workflow behavior after activation.

BEST PRACTICES - FORMS:
Only collect information that is required for the business process.

Use clear field names.

Keep forms simple for customers.

Review Form Responses regularly.

Make sure the Form Action is correctly connected to the workflow.

BEST PRACTICES - GOOGLE SHEETS:
Keep spreadsheet columns organized.

Use consistent phone number formatting.

Avoid unnecessary duplicate records.

Do not rename required columns without checking the integration requirements.

Verify that the correct spreadsheet and sheet/tab are selected.

Review synchronization results regularly.

GENERAL SUPPORT GUIDANCE:
When answering a user question about AllChat, first identify which AllChat section or feature the question relates to.

If the answer can be determined from this documentation, explain the answer clearly and provide the relevant navigation path.

When giving instructions, prefer step-by-step instructions using the actual AllChat menu names.

For example:
Go to Messaging -> Create Template.

Avoid inventing features, buttons, menu items, API endpoints, settings, limits, or behaviors that are not documented here.

If the documentation does not contain enough information to confidently answer a question, do not invent an answer.

If a question is outside the documented AllChat functionality or the available documentation is insufficient, tell the user that the information is not available in the current AllChat documentation and direct them to AllChat support.

SUPPORT CONTACT:
If the AI cannot confidently answer a question using the available AllChat documentation, the user should be directed to the official AllChat support email.

Support Email: support@allchat.in

When the documentation does not contain enough information, provide the support email instead of guessing.

The AI should answer using the documentation as its knowledge source. It should understand the meaning and context of the documentation rather than relying on predefined question-and-answer pairs.

The AI should not claim that a feature exists unless it is supported by the documentation.

The AI should not invent Meta API behavior, WhatsApp policies, billing rules, campaign limits, pricing, technical implementation details, or account-specific information unless that information is explicitly available in the documentation.

If a user asks a question that requires account-specific information, such as their current balance, specific campaign status, exact failed message reason, connected WhatsApp number, or a particular transaction, the AI should explain that it needs access to the relevant account data and should not guess the value.

If a user asks about something not covered in the documentation, respond politely that the available documentation does not contain enough information and provide the support email.

The AI should give concise answers for simple questions and detailed step-by-step instructions when the user asks how to perform an action.

The AI should preserve the terminology and navigation structure used by AllChat.

AllChat menu structure includes:

Dashboard

Messaging:
- Live Chat
- Create Template
- View Templates
- Send Test Message
- Test Message Report

Campaigns:
- Create Campaign
- Campaigns
- Campaign Reports
- Sheet Campaigns

Automation:
- Workflows
- Create Workflow
- Tags
- Opt-out Numbers
- Forms

Reports & Sheets:
- Campaign Reports
- Form Responses
- Sheet Reports

Transactions:
- Billing & Balance

Settings:
- WhatsApp Numbers
- Billing & Balance
- Recharge History
- Integrations

The purpose of this documentation is to provide the AI assistant with enough contextual knowledge to understand AllChat and help users navigate and use the platform without relying on predefined question-and-answer pairs.
`;

// --- CHUNKING LOGIC ---
// We group lines into logical chunks based on ALL CAPS section headers so the AI returns full steps.
const rawLines = rawDocumentation.split('\n');
const chunks: string[] = [];
let currentChunk = '';
const headerRegex = /^[A-Z][A-Z0-9 \-\/&]+:$/; // Matches headers like "CREATE CAMPAIGN:"

for (const line of rawLines) {
  const trimmedLine = line.trim();
  if (headerRegex.test(trimmedLine)) {
    if (currentChunk.trim()) chunks.push(currentChunk.trim());
    currentChunk = trimmedLine + '\n';
  } else {
    currentChunk += line + '\n';
  }
}
if (currentChunk.trim()) chunks.push(currentChunk.trim());

const KNOWLEDGE_BASE = chunks;
const SUPPORT_EMAIL = "hello@allchat.in";

// Helper to format time
const formatTime = () => {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

// Simplified beautify to just format paths nicely
const formatBeautifully = (text: string) => {
  return text
    // Format arrows for paths
    .replace(/->/g, ' ➜ ');
};

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { text: "Hey there! 👋 I'm Alex, your AllChat assistant. I'm here to help you navigate everything. What's on your mind today?", sender: 'bot', time: formatTime() }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState('Loading my brain...'); 
  
  const extractorRef = useRef<any>(null);
  const documentEmbeddingsRef = useRef<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const initAI = async () => {
      try {
        setAiStatus('Loading AI...');
        const { pipeline } = await import('@huggingface/transformers');
        
        extractorRef.current = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

        setAiStatus('Reading docs...');
        const docsMapped = await Promise.all(
          KNOWLEDGE_BASE.map(async (doc) => {
            const output = await extractorRef.current(doc, { pooling: 'mean', normalize: true });
            return { text: doc, embedding: output.data };
          })
        );
        
        documentEmbeddingsRef.current = docsMapped;
        setAiStatus('Ready to chat');
      } catch (error) {
        console.error("Error initializing local AI model:", error);
        setAiStatus('Error loading AI');
      }
    };

    initAI();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const calculateSimilarity = (vecA: number[], vecB: number[]) => {
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading || aiStatus !== 'Ready to chat') return;

    const userMessage = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { text: userMessage, sender: 'user', time: formatTime() }]);
    setIsLoading(true);

    try {
      let botResponse = '';
      
      // 1. Handle Greetings (Hi, Hello, etc.)
      const lowerCaseMsg = userMessage.toLowerCase();
      const greetings = ["hi", "hello", "hey", "good morning", "good afternoon", "good evening", "yo", "sup"];
      const isGreeting = greetings.some(g => lowerCaseMsg === g || lowerCaseMsg.startsWith(g + " ") || lowerCaseMsg.startsWith(g + "!"));
      
      const isHowAreYou = lowerCaseMsg.includes("how are you") || lowerCaseMsg.includes("how you doing");

      if (isGreeting || isHowAreYou) {
        const greetingsResponses = [
          "Hello! 😊 I'm doing great, thanks for asking! How can I help you with AllChat today?",
          "Hey there! 👋 Welcome to AllChat. What can I do for you?",
          "Hi! 🌟 I'm ready to assist. Do you have any questions about our platform?"
        ];
        botResponse = greetingsResponses[Math.floor(Math.random() * greetingsResponses.length)];
      } 
      // 2. Handle Documentation Questions
      else {
        const queryOutput = await extractorRef.current(userMessage, { pooling: 'mean', normalize: true });
        const queryEmbedding = queryOutput.data;

        let bestMatch = null;
        let highestScore = 0;

        for (const doc of documentEmbeddingsRef.current) {
          const score = calculateSimilarity(queryEmbedding, doc.embedding);
          if (score > highestScore) {
            highestScore = score;
            bestMatch = doc.text;
          }
        }

        if (highestScore > 0.30 && bestMatch) {
          const intros = [
            "Oh, I can definitely help with that! 😊 Here's what I found:",
            "Great question! Based on the documentation:",
            "Got it! Here's the scoop on that:"
          ];
          const outro = "Let me know if you need me to explain any part of that! 🤓";
          const randomIntro = intros[Math.floor(Math.random() * intros.length)];
          
          // Beautify the text (formats arrows)
          const formattedDoc = formatBeautifully(bestMatch);
          
          botResponse = `${randomIntro}\n\n${formattedDoc}\n\n${outro}`;
        } else {
          // Fallback to email if not in docs
          botResponse = `Hmm, I'm not entirely sure I caught that. 🤔 I couldn't find anything about that in my documentation. I really want to make sure you get the right help, so could you drop an email to ${SUPPORT_EMAIL}? Our team will take great care of you! 💌`;
        }
      }

      // Simulate human typing speed (approx 20 chars per second)
      const typingDelay = Math.min(2500, Math.max(700, botResponse.length * 35));
      
      setTimeout(() => {
        setMessages((prev) => [...prev, { text: botResponse, sender: 'bot', time: formatTime() }]);
        setIsLoading(false);
      }, typingDelay);

    } catch (error: any) {
      setMessages((prev) => [...prev, { text: `Oops! Something went wrong on my end. 🤖 ${error.message}`, sender: 'bot', time: formatTime() }]);
      setIsLoading(false);
    }
  };

  return (
    <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9999, fontFamily: 'Inter, -apple-system, sans-serif' }}>
      
      {isOpen && (
        <div style={{
          width: '380px',
          height: '560px',
          backgroundColor: '#ffffff',
          borderRadius: '20px',
          boxShadow: '0 15px 40px rgba(0,0,0,0.15)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid #e5e7eb',
          marginBottom: '12px',
          animation: 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards'
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #6d28d9 0%, #4f46e5 100%)',
            padding: '18px 22px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: 'white'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ 
                width: '42px', height: '42px', 
                backgroundColor: 'rgba(255,255,255,0.2)', 
                borderRadius: '50%', display: 'flex', 
                alignItems: 'center', justifyContent: 'center', 
                fontSize: '22px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}>🧑‍💻</div>
              <div>
                <div style={{ fontWeight: '600', fontSize: '16px', letterSpacing: '0.2px' }}>Alex from AllChat</div>
                <div style={{ fontSize: '12px', opacity: '0.9', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                   <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: aiStatus === 'Ready to chat' ? '#34d399' : '#fbbf24', display: 'inline-block', boxShadow: '0 0 8px currentColor' }}></span>
                   {aiStatus}
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', fontSize: '16px', cursor: 'pointer', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              ✕
            </button>
          </div>

          {/* Messages Area */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto', backgroundColor: '#f8fafc', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {messages.map((msg, index) => (
              <div key={index} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: msg.sender === 'user' ? 'flex-end' : 'flex-start',
                gap: '4px'
              }}>
                <div style={{
                  backgroundColor: msg.sender === 'user' ? '#4f46e5' : '#ffffff',
                  color: msg.sender === 'user' ? 'white' : '#1f2937',
                  padding: '12px 16px',
                  borderRadius: msg.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  fontSize: '14px',
                  lineHeight: '1.5',
                  maxWidth: '85%',
                  boxShadow: '0 2px 5px rgba(0,0,0,0.04)',
                  whiteSpace: 'pre-wrap' // Preserves line breaks and bullet points
                }}>
                  {msg.text}
                </div>
                <span style={{ fontSize: '10px', color: '#9ca3af', margin: '0 6px' }}>{msg.time}</span>
              </div>
            ))}
            
            {isLoading && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '4px' }}>
                <div style={{ backgroundColor: '#ffffff', padding: '14px 18px', borderRadius: '18px 18px 18px 4px', display: 'flex', gap: '6px', boxShadow: '0 2px 5px rgba(0,0,0,0.04)' }}>
                  <span style={{ width: '8px', height: '8px', backgroundColor: '#cbd5e1', borderRadius: '50%', animation: 'bounce 1.4s infinite' }}></span>
                  <span style={{ width: '8px', height: '8px', backgroundColor: '#cbd5e1', borderRadius: '50%', animation: 'bounce 1.4s infinite 0.2s' }}></span>
                  <span style={{ width: '8px', height: '8px', backgroundColor: '#cbd5e1', borderRadius: '50%', animation: 'bounce 1.4s infinite 0.4s' }}></span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div style={{ padding: '14px', backgroundColor: '#ffffff', borderTop: '1px solid #e5e7eb' }}>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '6px 6px 6px 16px', borderRadius: '30px', border: '1px solid #e2e8f0' }}>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                placeholder={aiStatus === 'Ready to chat' ? "Type your message..." : "Hold on, getting ready..."}
                disabled={aiStatus !== 'Ready to chat'}
                style={{
                  flex: 1,
                  border: 'none',
                  outline: 'none',
                  fontSize: '14px',
                  backgroundColor: 'transparent',
                  color: '#0f172a'
                }}
              />
              <button
                onClick={handleSendMessage}
                disabled={isLoading || aiStatus !== 'Ready to chat'}
                style={{
                  backgroundColor: '#4f46e5',
                  color: 'white',
                  border: 'none',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  transition: 'all 0.2s',
                  opacity: (isLoading || aiStatus !== 'Ready to chat') ? 0.4 : 1
                }}
              >
                ➤
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Chat Icon Button - Uses Image */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          style={{
            background: 'linear-gradient(135deg, #6d28d9 0%, #4f46e5 100%)',
            border: 'none',
            borderRadius: '50%',
            width: '68px',
            height: '68px',
            cursor: 'pointer',
            boxShadow: '0 10px 25px rgba(79, 70, 229, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0',
            overflow: 'hidden',
            animation: 'popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05) translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1) translateY(0)'}
        >
          {/* Make sure to place 'icon.png' inside your /public folder */}
          <img 
            src="/icon.png" 
            alt="Chat Icon" 
            style={{ 
              width: '36px', 
              height: '36px', 
              objectFit: 'contain',
              filter: 'brightness(0) invert(1)' // Makes the image white to match the gradient
            }} 
          />
        </button>
      )}

      <style jsx global>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
        /* Custom Scrollbar */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
      `}</style>
    </div>
  );
}
