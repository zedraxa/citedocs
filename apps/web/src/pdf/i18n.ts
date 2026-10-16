export interface PdfReaderI18nStrings {
  readerTitle: string;
  annotations: string;
  citeThis: string;
  splitView: string;
  fullscreen: string;
  close: string;
  loading: string;
  noAttachment: string;
  savedSuccessfully: string;
  citedSuccessfully: string;
  downloadPdf: string;
  page: string;
}

export const PDF_I18N: Record<"en" | "tr", PdfReaderI18nStrings> = {
  en: {
    readerTitle: "Zotero PDF Reader",
    annotations: "Annotations",
    citeThis: "Cite this",
    splitView: "Split View",
    fullscreen: "Full Page",
    close: "Close Reader",
    loading: "Loading PDF attachment...",
    noAttachment: "No PDF attachment selected",
    savedSuccessfully: "Annotations saved",
    citedSuccessfully: "Citation inserted into document",
    downloadPdf: "Download PDF",
    page: "Page",
  },
  tr: {
    readerTitle: "Zotero PDF Okuyucu",
    annotations: "Alıntılar ve Notlar",
    citeThis: "Belgeye Alıntıla",
    splitView: "Bölünmüş Ekran",
    fullscreen: "Tam Ekran",
    close: "Okuyucuyu Kapat",
    loading: "PDF eki yükleniyor...",
    noAttachment: "Seçili PDF eki bulunamadı",
    savedSuccessfully: "Alıntılar kaydedildi",
    citedSuccessfully: "Alıntı belgeye eklendi",
    downloadPdf: "PDF İndir",
    page: "Sayfa",
  },
};
