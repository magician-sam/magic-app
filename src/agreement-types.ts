export const agreementLanguages = ['en', 'fr', 'ar'] as const;
export type AgreementLanguage = typeof agreementLanguages[number];
export type AgreementAudience = 'customer' | 'supplier';
export type AgreementText = {summary:string; terms:string; privacy:string};
export type AgreementDetails = {
  audience:AgreementAudience; operator:string; address:string; contact:string;
  texts:Record<AgreementLanguage,AgreementText>;
};
export type AgreementDraft = AgreementDetails & {id:string; revision:number; updatedAt:string};
export type PublishedAgreement = AgreementDetails & {id:string; publishedAt:string; publishedBy:string; digest:string};
export type AgreementAcceptance = {version:string; language:AgreementLanguage; accepted:true};
export type PublicAgreement = {version:string; digest:string; publishedAt:string; audience:AgreementAudience; operator:string; language:AgreementLanguage; summary:string; termsUrl:string; privacyUrl:string};
