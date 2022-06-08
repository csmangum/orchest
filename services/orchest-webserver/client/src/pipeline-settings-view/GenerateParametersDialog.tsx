import { Code } from "@/components/common/Code";
import { useAppContext } from "@/contexts/AppContext";
import { isValidFile } from "@/hooks/useCheckFileValidity";
import { useDebounce } from "@/hooks/useDebounce";
import { useFetchPipelineJson } from "@/hooks/useFetchPipelineJson";
import {
  FILE_MANAGEMENT_ENDPOINT,
  queryArgs,
} from "@/pipeline-view/file-manager/common";
import { PipelineJson } from "@/types";
import { isValidJson } from "@/utils/isValidJson";
import {
  generateStrategyJson,
  pipelinePathToJsonLocation,
} from "@/utils/webserver-utils";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import LinearProgress from "@mui/material/LinearProgress";
import Stack from "@mui/material/Stack";
import { fetcher } from "@orchest/lib-utils";
import React from "react";
import { Controlled as CodeMirror } from "react-codemirror2";

export const pipelineJsonToParams = (
  pipelineJson: PipelineJson | undefined,
  reservedKey: string | undefined
) => {
  if (!pipelineJson || !reservedKey) {
    return "";
  }
  let strategyJson = generateStrategyJson(pipelineJson, reservedKey);

  // Cast parameters values to JSON
  Object.keys(strategyJson).forEach((key) => {
    Object.keys(strategyJson[key].parameters).forEach((paramKey) => {
      strategyJson[key].parameters[paramKey] = JSON.parse(
        strategyJson[key].parameters[paramKey]
      );
    });
    strategyJson[key] = strategyJson[key].parameters;
  });

  return JSON.stringify(strategyJson, null, 2);
};

const writeFile = ({
  body,
  path,
  pipelineUuid,
  projectUuid,
}: {
  body: string;
  path: string;
  pipelineUuid: string;
  projectUuid: string;
}) => {
  fetcher(
    `${FILE_MANAGEMENT_ENDPOINT}/create?${queryArgs({
      project_uuid: projectUuid,
      pipeline_uuid: pipelineUuid,
      path: path.startsWith("/") ? path : "/" + path,
      overwrite: "true",
      root: "/project-dir",
      use_project_root: "true",
    })}`,
    { body, method: "POST" }
  );
};

export const GenerateParametersDialog = ({
  isOpen,
  onClose,
  pipelinePath,
  projectUuid,
  pipelineUuid,
}: {
  isOpen: boolean;
  onClose: () => void;
  pipelinePath: string | undefined;
  projectUuid: string | undefined;
  pipelineUuid: string | undefined;
}) => {
  const { pipelineJson, isFetchingPipelineJson } = useFetchPipelineJson({
    projectUuid,
    pipelineUuid,
  });

  const { config, setConfirm, setAlert } = useAppContext();

  const [parameterFileString, setParameterFileString] = React.useState("");
  const parameterFileStringForValidation = useDebounce(
    parameterFileString,
    1000
  );
  const [copyButtonText, setCopyButtontext] = React.useState("Copy");

  React.useEffect(() => {
    setParameterFileString(
      pipelineJsonToParams(
        pipelineJson,
        config?.PIPELINE_PARAMETERS_RESERVED_KEY
      )
    );
  }, [pipelineJson, config?.PIPELINE_PARAMETERS_RESERVED_KEY]);

  const copyParams = () => {
    navigator.clipboard.writeText(
      pipelineJsonToParams(
        pipelineJson,
        config?.PIPELINE_PARAMETERS_RESERVED_KEY
      )
    );
    setCopyButtontext("Copied!");
  };

  const onCreateFile = (filePath: string | undefined) => {
    if (!filePath || !pipelineUuid || !projectUuid) return;
    writeFile({
      body: parameterFileString,
      path: filePath,
      pipelineUuid,
      projectUuid,
    });
    onClose();
  };

  const createParamFile = async () => {
    if (!isValidJson(parameterFileString)) {
      setAlert(
        "Invalid JSON",
        "Invalid JSON content. Please fix syntax errors before writing the file to disk."
      );
      return;
    }

    let filePath = pipelinePathToJsonLocation(pipelinePath ? pipelinePath : "");

    if (!projectUuid || !pipelineUuid || !filePath) {
      return;
    }

    // Check if file exists
    try {
      const doesFileExist = await isValidFile(
        projectUuid,
        pipelineUuid,
        filePath,
        ["json"],
        true
      );
      if (!doesFileExist) {
        onCreateFile(filePath);
        return;
      }

      setConfirm(
        "Warning",
        "This file already exists, do you want to overwrite it?",
        async (resolve) => {
          onCreateFile(filePath);
          resolve(true);
          return true;
        }
      );
    } catch (error) {
      setAlert("Error", `Failed to create Parameter file. ${error}`);
    }
  };

  const isParameterJsonValid = React.useMemo(() => {
    if (!parameterFileStringForValidation) return true;
    return isValidJson(parameterFileStringForValidation);
  }, [parameterFileStringForValidation]);

  return (
    <Dialog
      open={isOpen}
      onClose={onClose}
      fullWidth
      maxWidth="sm"
      PaperProps={{ sx: { overflowY: "visible" } }}
    >
      <form id="generate-parameters">
        <DialogTitle>Pipeline parameters file</DialogTitle>
        <DialogContent sx={{ overflowY: "visible" }}>
          <Stack direction="column" spacing={2}>
            <Box>
              <span>The parameter file will be created at: </span>
              <Code>
                {pipelinePathToJsonLocation(pipelinePath ? pipelinePath : "")}
              </Code>
            </Box>
            {isFetchingPipelineJson && <LinearProgress />}
            {!isFetchingPipelineJson && (
              <>
                <CodeMirror
                  value={parameterFileString}
                  onBeforeChange={(editor, data, value) => {
                    setParameterFileString(value);
                  }}
                  options={{
                    mode: "application/json",
                    theme: "jupyter",
                    lineNumbers: true,
                  }}
                />
                {!isParameterJsonValid && (
                  <Alert
                    severity="warning"
                    sx={{ marginTop: (theme) => theme.spacing(2) }}
                  >
                    Your input is not valid JSON.
                  </Alert>
                )}
              </>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button color="secondary" onClick={onClose}>
            Close
          </Button>
          <Button color="secondary" onClick={copyParams}>
            {copyButtonText}
          </Button>
          <Button variant="contained" onClick={createParamFile}>
            Create file
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
};
