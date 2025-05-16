// Define the structure for the index.json file used by Killercoda

export interface IndexJson {
  title: string;
  description: string;
  details: IndexJsonDetails;
  backend: IndexJsonBackend;
  // Optional fields can be added here if needed
  // frontend?: { port: number };
  // assets?: { host_path: string; guest_path: string }[];
}

export interface IndexJsonDetails {
  intro?: IndexJsonIntro;
  steps: IndexJsonStep[];
  finish?: IndexJsonFinish;
}

export interface IndexJsonIntro {
  text: string; // Path to intro markdown file (e.g., "intro.md")
  background?: string; // Path to setup script (e.g., "setup.sh")
  foreground?: string; // Path to foreground script
}

export interface IndexJsonStep {
  title: string;
  text?: string; // Path to step markdown file (e.g., "step1/text.md")
  verify?: string; // Path to verification script (e.g., "step1/verify.sh")
  // Optional fields:
  // background?: string;
  // foreground?: string;
}

export interface IndexJsonFinish {
  text: string; // Path to finish markdown file (e.g., "finish.md")
}

export interface IndexJsonBackend {
  imageid: string; // e.g., "ubuntu", "kubernetes-kubeadm-1node"
}

// Structure for the result of scanning lab files
export interface LabFiles {
  introFile?: string;
  setupFile?: string;
  finishFile?: string;
  steps: LabStepFile[];
}

export interface LabStepFile {
  folder: string; // e.g., "step1"
  textFile?: string; // e.g., "step1/text.md"
  verifyFile?: string; // e.g., "step1/verify.sh"
}
