import type { ConfirmDocumentInput } from "@/lib/types";

export function buildDocumentConfirmationFormData(
  input: ConfirmDocumentInput,
  file: File | null,
): FormData {
  const formData = new FormData();
  formData.append("input", JSON.stringify(input));
  if (file) formData.append("file", file, file.name);
  return formData;
}

export function confirmsDocumentDeletion(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    "deleted" in value &&
    value.deleted === true &&
    (!("storageDeleted" in value) || value.storageDeleted !== false)
  );
}

