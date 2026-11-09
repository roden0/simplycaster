// Passkey ceremonies in the browser (ADR-0011): the Coordinator's JSON options in, the JSON answer out.

export async function createPasskey(options: unknown): Promise<unknown> {
  const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON(options as PublicKeyCredentialCreationOptionsJSON);
  const credential = (await navigator.credentials.create({ publicKey })) as PublicKeyCredential;
  return credential.toJSON();
}

export async function getPasskey(options: unknown): Promise<unknown> {
  const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(options as PublicKeyCredentialRequestOptionsJSON);
  const credential = (await navigator.credentials.get({ publicKey })) as PublicKeyCredential;
  return credential.toJSON();
}
