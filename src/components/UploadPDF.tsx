import React, { useState, useEffect, useRef, DragEvent } from "react";
import { supabase } from "../lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Upload, Copy, ChevronLeft, ChevronRight } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/esm/Page/AnnotationLayer.css";
import "react-pdf/dist/esm/Page/TextLayer.css";
import Highlight from "react-highlight-words";
import { set } from "zod";

pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface Session {
  user: {
    id: string;
  };
}

type SearchResult = {
  page: number;
  context: string;
  term: string;
  fullText: string;
  summary: string;
};

function UploadPDF() {
  const [session, setSession] = useState<Session | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [selectedFileUrl, setSelectedFileUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [foundResults, setFoundResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);

  const pageRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const apikey = import.meta.env.VITE_GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apikey);

  const defaultSearchTerms = ["breach", "training"];

  // Summarize text using Google Generative AI
  const summarizeText = async (text: string): Promise<string> => {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const response = await model.generateContent(`Summarize this: ${text}`);
      const summary = response.response.text();
      return summary;
    } catch (error) {
      return "Failed to generate summary.";
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadFiles();
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) loadFiles();
    });

    return () => {
      subscription?.unsubscribe();
    };
  }, []);

  // Highlight logic
  useEffect(() => {
    if (selectedResult && pageRef.current) {
      const highlightText = () => {
        const textLayer = pageRef.current.querySelector(
          ".react-pdf__Page__textContent"
        );
        if (!textLayer) return;

        const existingHighlights =
          textLayer.querySelectorAll(".text-highlight");
        existingHighlights.forEach((el) => {
          el.classList.remove("text-highlight");
        });

        const textElements = Array.from(textLayer.querySelectorAll("span"));
        let paragraphStart = -1;
        let paragraphEnd = -1;
        let foundParagraph = false;

        textElements.forEach((element, index) => {
          const elementText = element.textContent || "";
          if (
            elementText
              .toLowerCase()
              .includes(selectedResult.term.toLowerCase()) &&
            !foundParagraph
          ) {
            foundParagraph = true;

            for (let i = index; i >= 0; i--) {
              const prevText = textElements[i].textContent;
              if (prevText?.trim() === "") {
                paragraphStart = i + 1;
                break;
              }
            }
            if (paragraphStart === -1) paragraphStart = 0;

            for (let i = index; i < textElements.length; i++) {
              const nextText = textElements[i].textContent;
              if (nextText?.trim() === "") {
                paragraphEnd = i - 1;
                break;
              }
            }
            if (paragraphEnd === -1) paragraphEnd = textElements.length - 1;
          }
        });

        if (paragraphStart !== -1 && paragraphEnd !== -1) {
          for (let i = paragraphStart; i <= paragraphEnd; i++) {
            textElements[i].classList.add("text-highlight");
          }
        }

        textElements.forEach((element) => {
          const elementText = element.textContent || "";
          if (
            elementText
              .toLowerCase()
              .includes(selectedResult.term.toLowerCase())
          ) {
            element.classList.add("term-highlight");
          }
        });
      };

      setTimeout(highlightText, 100);
    }
  }, [selectedResult, currentPage]);

  const loadFiles = async () => {
    if (!session?.user?.id) return;
    const { data, error } = await supabase.storage
      .from("filestorage")
      .list(session.user.id);
    if (error) {
      return;
    }
    return data;
  };

  const handleCopyResults = () => {
    if (foundResults.length === 0) {
      alert("No search results to copy!");
      return;
    }

    const textToCopy = foundResults
      .map((result) => `Page ${result.page}: ${result.context}`)
      .join("\n\n");

    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        alert("Search results copied to clipboard!");
      })
      .catch((err) => {
        alert("Failed to copy search results, please try again.");
      });
  };

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const droppedFiles = e.dataTransfer.files;
    if (droppedFiles.length > 0) {
      const file = droppedFiles[0];
      if (file.type !== "application/pdf") {
        alert("Please upload a PDF file");
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        alert("File size must be less than 5MB");
        return;
      }
      await handleFileUpload(file);
    }
  };

  const handleFileUpload = async (file: File) => {
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${session?.user?.id}/${fileName}`;
    setUploading(true);
    setSelectedFileUrl(null);

    try {
      if (!session?.user?.id) throw new Error("Unauthorized access");

      // Upload the file to Supabase storage
      const { error: uploadError } = await supabase.storage
        .from("filestorage")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Insert transaction record
      const userName =
        (session.user as any).identities[0].identity_data.full_name ||
        "Unknown User";

      const { error: insertError } = await supabase
        .from("transactions")
        .insert([
          {
            user_id: session.user.id,
            user_name: userName,
            pdf_name: file.name,
          },
        ]);

      if (insertError) throw insertError;

      // Reload files
      const updatedFiles = await loadFiles();
      if (updatedFiles && updatedFiles.length > 0) {
        const newFile = updatedFiles.find((f) => f.name === fileName);
        if (newFile) {
          const url = await getFileUrl(newFile.name);
          setSelectedFileUrl(url);
          setCurrentPage(1);
          setFoundResults([]);
          setSelectedResult(null);
          setSearchTerm(defaultSearchTerms.join("|"));
          await searchPDF(url, defaultSearchTerms.join("|"));
        }
      }
    } catch (error) {
      alert((error as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    if (file.type !== "application/pdf") {
      alert("Please upload a PDF file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert("File size must be less than 5MB");
      return;
    }
    handleFileUpload(file);
  };

  const searchPDF = async (url: string, searchTerm: string) => {
    if (!url || !searchTerm) return;
    setIsLoading(true);
    setSelectedResult(null);

    try {
      const pdf = await pdfjs.getDocument(url).promise;
      const results: SearchResult[] = [];
      const searchTerms = searchTerm.toLowerCase().split("|");

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const textItems = textContent.items.map((item) => (item as any).str);
        const fullText = textItems.join(" ");

        for (const term of searchTerms) {
          const regex = new RegExp(`[^,]*${term}[^,]*`, "gi");
          let match;
          while ((match = regex.exec(fullText)) !== null) {
            const startIndex = Math.max(0, match.index);
            const endIndex = Math.min(fullText.length, regex.lastIndex);

            let contextStart = startIndex;
            while (contextStart > 0 && fullText[contextStart - 1] !== ",") {
              contextStart--;
            }

            let contextEnd = endIndex;
            while (
              contextEnd < fullText.length &&
              fullText[contextEnd] !== ","
            ) {
              contextEnd++;
            }
            if (contextEnd < fullText.length) contextEnd++;

            const context = fullText.slice(contextStart, contextEnd).trim();
            const summary = await summarizeText(context);

            results.push({
              page: i,
              context,
              term,
              fullText: context,
              summary,
            });
          }
        }
      }

      setFoundResults(results);
      setIsLoading(false);

      if (results.length > 0) {
        setCurrentPage(results[0].page);
        setSelectedResult(results[0]);
      }
    } catch (error) {
      alert("Error while searching PDF, Please try again later.");
    }
  };

  const getFileUrl = async (fileName: string) => {
    const { data } = await supabase.storage
      .from("filestorage")
      .getPublicUrl(`${session?.user?.id}/${fileName}`);
    return data.publicUrl;
  };

  const handleResultClick = (result: SearchResult) => {
    setCurrentPage(result.page);
    setSelectedResult(result);
  };

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Upload area */}
      <div
        className={`card mb-4 transition-all duration-300 ${
          isDragging
            ? "ring-2 ring-primary-500 bg-primary-50"
            : "hover:shadow-lg"
        }`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <label className="flex flex-col items-center gap-4 cursor-pointer group py-6">
          <div className="p-4 rounded-full bg-primary-50 group-hover:bg-primary-100 transition-colors duration-200">
            <Upload className="w-8 h-8 text-primary-600" />
          </div>
          <div className="text-center">
            <p className="text-lg font-medium text-gray-700 group-hover:text-gray-900">
              {isDragging ? "Drop your file here" : "Upload PDF File"}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Drag and drop or click to select
            </p>
            <p className="text-xs text-gray-400 mt-1">PDF files up to 5MB</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileInputChange}
            disabled={uploading}
            accept=".pdf"
          />
        </label>
      </div>

      {uploading && !selectedFileUrl && (
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
        </div>
      )}

      {/* Main content area (PDF preview + search results) */}
      {selectedFileUrl && (
        <div className="grid grid-cols-1 xl:grid-cols-[60%_40%] gap-6">
          {/* PDF Preview */}
          <div className="bg-white rounded-lg shadow p-4 sm:p-6 mb-6 xl:mb-0">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 text-center">
              PDF Preview
            </h2>
            <div className="pdf-wrapper w-full overflow-x-auto">
              <div ref={pageRef} className="pdf-container mx-auto">
                <Document
                  file={selectedFileUrl}
                  onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                >
                  <Page pageNumber={currentPage} />
                </Document>
              </div>
            </div>
            <div className="flex justify-between items-center mt-4">
              <button
                onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                className="nav-button px-2 py-1 border border-gray-300 rounded hover:bg-gray-100"
                disabled={currentPage <= 1}
              >
                <ChevronLeft />
              </button>
              <p className="text-sm text-gray-600">
                Page {currentPage} of {numPages || 0}
              </p>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(p + 1, numPages || 1))
                }
                className="nav-button px-2 py-1 border border-gray-300 rounded hover:bg-gray-100"
                disabled={currentPage >= (numPages || 1)}
              >
                <ChevronRight />
              </button>
            </div>
          </div>

          {/* Search Results */}
          <div className="bg-white rounded-lg shadow p-4 sm:p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <div className="loading-spinner w-12 h-12 mb-3" />
                <p className="text-gray-600">Analyzing document...</p>
              </div>
            ) : foundResults.length > 0 ? (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">
                    Search Results ({foundResults.length})
                  </h3>
                  <button
                    onClick={handleCopyResults}
                    className="btn-secondary flex items-center gap-2 text-sm px-2 py-1 border border-gray-300 rounded hover:bg-gray-100"
                  >
                    <Copy size={16} />
                    Copy All
                  </button>
                </div>
                <div className="custom-scrollbar overflow-y-auto max-h-[800px]">
                  <div className="space-y-4">
                    {foundResults.map((result, index) => (
                      <div
                        key={index}
                        className={`p-3 rounded cursor-pointer transition-colors duration-150 ${
                          selectedResult === result
                            ? "ring-2 ring-primary-500 bg-primary-50"
                            : "hover:bg-gray-50"
                        }`}
                        onClick={() => handleResultClick(result)}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-500"></span>
                          <span className="text-xs text-primary-800 px-2 py-1 rounded-full bg-primary-100">
                            {result.term}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">
                          {result.summary}
                        </p>
                        <div className="text-sm text-gray-800">
                          <Highlight
                            searchWords={searchTerm
                              .split("|")
                              .map((term) => term.trim())}
                            autoEscape={true}
                            textToHighlight={result.context}
                          />
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          Page {result.page}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">
                No found breach and training term. Try different pdf.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default UploadPDF;
