const statusLabels: Record<string,string> = {
  PENDING:'검토 대기',APPROVED:'공개',HIDDEN:'숨김',
};
const actionLabels: Record<string,string> = {
  CREATED:'작성',EDITED:'수정',APPROVED:'공개 승인',
  HIDDEN:'숨김',REPORTED:'신고',
};
const roleLabels: Record<string,string> = {
  customer:'고객',admin:'관리자',
};
const scanLabels: Record<string,string> = {
  PENDING:'검사 대기',PASS:'검사 통과',FAILED:'검사 실패',
};

function knownOrRaw(labels: Record<string,string>,value: string) {
  return labels[value] ?? value;
}

export const reviewStatusLabel = (value: string) => knownOrRaw(statusLabels,value);
export const reviewActionLabel = (value: string) => knownOrRaw(actionLabels,value);
export const reviewActorRoleLabel = (value: string) => knownOrRaw(roleLabels,value);
export const reviewScanStatusLabel = (value: string) => knownOrRaw(scanLabels,value);
