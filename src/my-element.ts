import { LitElement, html, css } from "lit";
import { property, state } from "lit/decorators.js";
import * as pdfjsLib from "pdfjs-dist";
import Tesseract from "tesseract.js";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

export class PdfUploader extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
    }
    input[type="file"] {
      display: none;
    }
    .btn {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0.5rem 1rem;
      border: 1px solid #ccc;
      border-radius: 8px;
      background: #f5f5f5;
    }
  `;

  /**
   * Holds the final extracted text.
   * Can be read externally if needed.
   */
  @property({ type: String })
  textData: string = "";

  /**
   * Internal loading state while OCR/PDF parsing runs
   */
  @state()
  private loading: boolean = false;

  render() {
    return html`
      <label class="btn">
        <slot> Upload PDF</slot>
        <input type="file" accept="application/pdf" @change=${this._handleFile} />
      </label>

      ${this.loading ? html`<p>Processing </p>` : null}
    `;
  }

  private async _handleFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    this.loading = true;
    const text = await this._extractText(file);
    this.textData = text;
    this.loading = false;

    this.dispatchEvent(
      new CustomEvent("pdf-data", {
        detail: { text, file },
        bubbles: true,
        composed: true,
      })
    );
  }

  private async _extractText(file: File): Promise<string> {
    const fileUrl = URL.createObjectURL(file);
    let fullText = "";

    try {
      const pdf = await pdfjsLib.getDocument(fileUrl).promise;

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        //@ts-expect-error
        const strings = content.items.map((item) => item.str).join(" ");

        if (strings.trim().length > 5) {
          fullText += `\nPage ${i}:\n${strings}`;
        } else {
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d")!;
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          //@ts-expect-error
          await page.render({ canvasContext: ctx, viewport }).promise;
          const dataUrl = canvas.toDataURL();

          const ocrResult = await Tesseract.recognize(dataUrl, "eng");
          fullText += `\nPage ${i} (OCR):\n${ocrResult.data.text}`;
        }

        this.dispatchEvent(
          new CustomEvent("pdf-progress", {
            detail: { currentPage: i, totalPages: pdf.numPages },
            bubbles: true,
            composed: true,
          })
        );
      }
    } finally {
      URL.revokeObjectURL(fileUrl);
    }

    return fullText;
  }
}

customElements.define("pdf-uploader", PdfUploader);
