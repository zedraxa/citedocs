import { LANG_STORAGE_KEY } from "../auth/languageMigration.js";

export type DocumentLanguage = "en" | "tr";

export const docTranslations = {
  en: {
    myDocuments: "My Documents",
    sharedWithMe: "Shared with Me",
    allDocuments: "All Documents",
    newDocument: "New Document",
    blankDocx: "Blank Word Document (.docx)",
    blankOdt: "Blank LibreOffice Document (.odt)",
    uploadDocument: "Upload Document",
    searchPlaceholder: "Search documents...",
    storageQuota: "Storage Quota",
    storageUsed: "{used} of {total} used ({percent}%)",
    storageFreeNotice: "100% Free Academic Storage (5 GB per student)",
    open: "Open",
    editorTagline: "ONLYOFFICE • Zotero Ecosystem",
    download: "Download",
    rename: "Rename",
    delete: "Delete",
    share: "Share",
    shareDialogTitle: "Share Document",
    shareEmailPlaceholder: "collaborator@university.edu",
    roleViewer: "Viewer (Read-only)",
    roleEditor: "Editor (Can edit)",
    roleOwner: "Owner",
    shareAction: "Send Invite",
    sharesList: "People with access",
    noSharesYet: "This document is private to you. Share it with classmates or advisors.",
    unshare: "Remove access",
    renameTitle: "Rename Document",
    newTitlePlaceholder: "Enter new title",
    save: "Save",
    cancel: "Cancel",
    confirmDelete: "Are you sure you want to delete this document?",
    deleteWarning: "This document will be moved to trash and removed from your cloud storage.",
    emptyStateMy:
      "No documents yet. Create a new document or upload an existing file to get started.",
    emptyStateShared: "No documents shared with you yet.",
    lastUpdated: "Updated",
    created: "Created",
    size: "Size",
    role: "Access",
    actions: "Actions",
    fileTooLarge: "File exceeds the generous 100 MB upload limit.",
    quotaExceeded: "Your 5 GB cloud storage quota has been reached.",
    unsupportedFile: "Only .docx, .odt, and .pdf files are supported.",
    uploading: "Uploading document...",
    creating: "Creating document...",
    savedSuccess: "Saved successfully",
    backToEditor: "Open Active Editor",
    language: "Language",
    sharedBy: "Shared by",
    dropFilesHere: "Drop files here to upload (.docx, .odt, .pdf)",
    loadingDocuments: "Loading documents...",
    docTypeDocx: "Microsoft Word",
    docTypeOdt: "LibreOffice Writer",
    docTypePdf: "PDF Document",
    cloud: "Cloud",
  },
  tr: {
    myDocuments: "Belgelerim",
    sharedWithMe: "Benimle Paylaşılanlar",
    allDocuments: "Tüm Belgeler",
    newDocument: "Yeni Belge",
    blankDocx: "Boş Word Belgesi (.docx)",
    blankOdt: "Boş LibreOffice Belgesi (.odt)",
    uploadDocument: "Belge Yükle",
    searchPlaceholder: "Belgelerde ara...",
    storageQuota: "Depolama Alanı",
    storageUsed: "{total} alanın {used} kadarı kullanılıyor (%{percent})",
    storageFreeNotice: "Öğrenciler İçin %100 Ücretsiz Bulut Alanı (Kullanıcı başına 5 GB)",
    open: "Aç",
    editorTagline: "ONLYOFFICE • Zotero Ekosistemi",
    download: "İndir",
    rename: "Yeniden Adlandır",
    delete: "Sil",
    share: "Paylaş",
    shareDialogTitle: "Belgeyi Paylaş",
    shareEmailPlaceholder: "arkadas@universite.edu.tr",
    roleViewer: "Görüntüleyici (Salt okunur)",
    roleEditor: "Düzenleyici (Düzenleyebilir)",
    roleOwner: "Sahip",
    shareAction: "Paylaş",
    sharesList: "Erişimi olan kişiler",
    noSharesYet:
      "Bu belge yalnızca size özeldir. Danışmanınız veya arkadaşlarınızla paylaşabilirsiniz.",
    unshare: "Erişimi kaldır",
    renameTitle: "Belgeyi Yeniden Adlandır",
    newTitlePlaceholder: "Yeni başlık girin",
    save: "Kaydet",
    cancel: "İptal",
    confirmDelete: "Bu belgeyi silmek istediğinize emin misiniz?",
    deleteWarning: "Belge çöp kutusuna taşınacak ve bulut alanınızdan düşülecektir.",
    emptyStateMy: "Henüz bir belgeniz yok. Yeni bir belge oluşturarak veya yükleyerek başlayın.",
    emptyStateShared: "Henüz sizinle paylaşılan bir belge yok.",
    lastUpdated: "Son Güncelleme",
    created: "Oluşturulma",
    size: "Boyut",
    role: "Erişim",
    actions: "İşlemler",
    fileTooLarge: "Dosya boyutu 100 MB sınırını aşıyor.",
    quotaExceeded: "5 GB bulut depolama kotanız doldu.",
    unsupportedFile: "Yalnızca .docx, .odt ve .pdf dosyaları desteklenmektedir.",
    uploading: "Belge yükleniyor...",
    creating: "Belge oluşturuluyor...",
    savedSuccess: "Başarıyla kaydedildi",
    backToEditor: "Aktif Editörü Aç",
    language: "Dil",
    sharedBy: "Paylaşan",
    dropFilesHere: "Yüklemek için dosyaları buraya bırakın (.docx, .odt, .pdf)",
    loadingDocuments: "Belgeler yükleniyor...",
    docTypeDocx: "Word Belgesi",
    docTypeOdt: "LibreOffice Belgesi",
    docTypePdf: "PDF Belgesi",
    cloud: "Bulut",
  },
};

export function getDocumentLanguage(): DocumentLanguage {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "tr" || saved === "en") return saved;
  }
  return "tr";
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function formatDocumentDate(
  dateStr: string | number | Date,
  lang: DocumentLanguage = "tr"
): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleString(lang === "tr" ? "tr-TR" : "en-US", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Istanbul",
  });
}
