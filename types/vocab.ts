export type JLPTLevel = "N5" | "N4" | "N3" | "N2" | "N1";

export type Vocab = {
  id: string;
  word: string;
  reading: string;
  meaning: string;
  level: JLPTLevel;
};
