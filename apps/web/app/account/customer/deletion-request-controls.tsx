type Props = {
  confirming: boolean;
  busy: boolean;
  onBegin: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeletionRequestControls({ confirming, busy, onBegin, onCancel, onConfirm }: Props) {
  if (!confirming) {
    return <button className="primary-button" type="button" disabled={busy} onClick={onBegin}>탈퇴 요청 접수</button>;
  }

  return (
    <div className="account-form" role="group" aria-labelledby="deletion-confirm-title">
      <strong id="deletion-confirm-title">탈퇴 요청 확인</strong>
      <p>탈퇴 요청을 접수할까요? 실제 계정 삭제는 운영 검토 후 진행됩니다.</p>
      <button className="primary-button" type="button" disabled={busy} onClick={onConfirm}>요청 접수 확인</button>
      <button className="secondary-button" type="button" disabled={busy} onClick={onCancel} autoFocus>취소</button>
    </div>
  );
}
