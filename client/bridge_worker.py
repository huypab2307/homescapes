"""Fixed frozen Python worker; the bridge source comes from a verified payload."""
from pathlib import Path
import os
import runpy
import sys
# PyInstaller's hidden hc_client import collects its standard-library dependencies.
if __name__ == '__main__':
    source = Path(os.environ['HC_BRIDGE_SCRIPT'])
    sys.argv[0] = str(source)
    runpy.run_path(str(source), run_name='__main__')
