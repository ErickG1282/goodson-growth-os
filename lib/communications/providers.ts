export type CommunicationChannel = "Email" | "SMS" | "Push" | "Internal" | "Driver" | "Customer" | "WhatsApp";
export type ProviderName = "Twilio" | "SendGrid" | "Resend" | "Firebase" | "Apple Push" | "Google Push" | "Internal Queue";
export type QueuedCommunication = { id:string;channel:CommunicationChannel;recipientName:string|null;recipientEmail:string|null;recipientPhone:string|null;subject:string;message:string };
export type ProviderResult = { providerMessageId:string;status:"Sent"|"Delivered" };

export interface CommunicationProvider { readonly name:ProviderName; supports(channel:CommunicationChannel):boolean; send(communication:QueuedCommunication):Promise<ProviderResult>; }

export class ProviderNotConnectedError extends Error { constructor(provider:ProviderName){super(`${provider} is not connected.`);this.name="ProviderNotConnectedError";} }

abstract class FutureProvider implements CommunicationProvider {
  abstract readonly name:ProviderName; abstract supports(channel:CommunicationChannel):boolean;
  async send():Promise<ProviderResult>{throw new ProviderNotConnectedError(this.name);}
}
export class TwilioProvider extends FutureProvider {readonly name="Twilio" as const;supports(channel:CommunicationChannel){return channel==="SMS"||channel==="WhatsApp";}}
export class SendGridProvider extends FutureProvider {readonly name="SendGrid" as const;supports(channel:CommunicationChannel){return channel==="Email";}}
export class ResendProvider extends FutureProvider {readonly name="Resend" as const;supports(channel:CommunicationChannel){return channel==="Email";}}
export class FirebaseProvider extends FutureProvider {readonly name="Firebase" as const;supports(channel:CommunicationChannel){return channel==="Push";}}
export class ApplePushProvider extends FutureProvider {readonly name="Apple Push" as const;supports(channel:CommunicationChannel){return channel==="Push";}}
export class GooglePushProvider extends FutureProvider {readonly name="Google Push" as const;supports(channel:CommunicationChannel){return channel==="Push";}}
