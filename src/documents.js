import { getGoogleClients, contractsFolderId } from './google.js';
import { clean, recordDocument, updateApplicantDocumentLink } from './sheets.js';

export function tagMap(applicant) {
  return {
    caseNumber: applicant.caseNumber,
    fullName: applicant.fullName,
    surname: applicant.surname,
    firstName: applicant.firstName,
    patronymic: applicant.patronymic,
    upperSurname: applicant.upperSurname,
    initialsName: applicant.initialsName,
    specialtyName: applicant.specialtyName,
    specialtyCode: applicant.specialtyCode,
    competitiveScore: applicant.competitiveScore,
    submissionMode: applicant.submissionMode,
    studyPlace: applicant.studyPlace,
    recommendedStatus: applicant.recommendedStatus,
    applicationStatus: applicant.applicationStatus,
    militaryDocumentStatus: applicant.militaryDocumentStatus,
    passportSeries: applicant.passportSeries,
    passportNumber: applicant.passportNumber,
    passportIssuedBy: applicant.passportIssuedBy,
    passportIssuedAt: applicant.passportIssuedAt,
    taxId: applicant.taxId,
    phone: applicant.phone,
    email: applicant.email,
    registrationAddress: applicant.registrationAddress,
    personId: applicant.personId,
    educationType: applicant.educationType,
    educationSeries: applicant.educationSeries,
    educationNumber: applicant.educationNumber,
    educationDate: applicant.educationDate,
    educationIssuedBy: applicant.educationIssuedBy,
    payerFullName: applicant.payerFullName,
    payerTaxId: applicant.payerTaxId,
    createdAt: applicant.createdAt,
    createdBy: applicant.createdBy,
    updatedAt: applicant.updatedAt,
    updatedBy: applicant.updatedBy
  };
}

export async function generateContract(applicant) {
  const templateId = clean(applicant.templateId);
  if (!templateId) throw new Error('Для спеціальності не вказано ID шаблону Google Docs.');

  const { drive, docs } = getGoogleClients();
  const copy = await drive.files.copy({
    fileId: templateId,
    supportsAllDrives: true,
    requestBody: {
      name: `Договір ${applicant.caseNumber} ${applicant.fullName}`,
      parents: [contractsFolderId()]
    },
    fields: 'id, webViewLink'
  });

  const documentId = copy.data.id;
  const requests = Object.entries(tagMap(applicant)).map(([key, value]) => ({
    replaceAllText: {
      containsText: { text: `{{${key}}}`, matchCase: true },
      replaceText: clean(value)
    }
  }));

  await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests }
  });

  const file = await drive.files.get({
    fileId: documentId,
    fields: 'id, webViewLink',
    supportsAllDrives: true
  });

  await recordDocument(applicant, file.data);
  await updateApplicantDocumentLink(applicant.id, file.data.webViewLink);
  return {
    contractDocId: file.data.id,
    contractDocUrl: file.data.webViewLink
  };
}
