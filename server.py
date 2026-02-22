"""
CGToolbox Web 版本 - FastAPI 后端
提供 REST API 和 WebSocket 实时通信
"""

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List, Dict
import asyncio
import subprocess
import os
import json
from pathlib import Path
from datetime import datetime

# ==================== 配置 ====================
SCRIPTS_DIR = Path(__file__).parent / "scripts"
USER_HOME = Path.home()
PROFILE_STORE_PATH = USER_HOME / ".claude-switcher"
PROFILES_FILE = PROFILE_STORE_PATH / "profiles.json"
CLAUDE_CONFIG_PATH = USER_HOME / ".claude.json"

# ==================== FastAPI 应用 ====================
app = FastAPI(
    title="CGToolbox API",
    description="CG 工具箱 Web 版本",
    version="1.0.0"
)

# CORS 配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==================== 模型定义 ====================
class ScriptInfo(BaseModel):
    name: str
    path: str
    icon: str
    type: str

class ClaudeConfig(BaseModel):
    authToken: str
    baseApi: str

class AddConfigRequest(BaseModel):
    name: str
    config: ClaudeConfig

class SvnDiffRequest(BaseModel):
    revision: str
    url: str
    fromRepoRoot: bool = False
    parentLevels: int = 0

class SvnApplyRequest(BaseModel):
    patchContent: str
    targetDir: str
    sourcePath: str
    revision: str

# ==================== 脚本运行器 ====================
class ScriptRunner:
    def __init__(self):
        self.process: Optional[asyncio.subprocess.Process] = None
    
    def list_scripts(self) -> List[ScriptInfo]:
        icons = {".py": "🐍", ".bat": "⚙️", ".ps1": "🟦"}
        scripts = []
        
        try:
            for file in SCRIPTS_DIR.iterdir():
                if file.is_file():
                    ext = file.suffix.lower()
                    if ext in icons and "toolbox" not in file.name.lower():
                        scripts.append(ScriptInfo(
                            name=file.name,
                            path=str(file),
                            icon=icons[ext],
                            type=ext[1:]
                        ))
            return sorted(scripts, key=lambda x: x.name)
        except Exception as e:
            print(f"Error listing scripts: {e}")
            return []
    
    async def run_script(self, script_path: str, websocket: WebSocket):
        """运行脚本并通过 WebSocket 推送输出"""
        script = Path(script_path)
        ext = script.suffix.lower()
        
        if ext == ".py":
            cmd = ["python", "-u", str(script)]
        elif ext == ".bat":
            cmd = ["cmd", "/c", str(script)]
        elif ext == ".ps1":
            cmd = ["powershell", "-ExecutionPolicy", "Bypass", "-File", str(script)]
        else:
            await websocket.send_json({"type": "error", "data": f"不支持的脚本类型: {ext}"})
            return
        
        try:
            self.process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=str(script.parent),
                env={**os.environ, "PYTHONIOENCODING": "utf-8"}
            )
            
            await websocket.send_json({"type": "start", "script": script.name})
            
            async def read_stream(stream, stream_type):
                while True:
                    line = await stream.readline()
                    if not line:
                        break
                    text = line.decode("utf-8", errors="replace")
                    await websocket.send_json({"type": stream_type, "data": text})
            
            await asyncio.gather(
                read_stream(self.process.stdout, "stdout"),
                read_stream(self.process.stderr, "stderr")
            )
            
            exit_code = await self.process.wait()
            await websocket.send_json({"type": "end", "exitCode": exit_code})
            
        except Exception as e:
            await websocket.send_json({"type": "error", "data": str(e)})
        finally:
            self.process = None
    
    def terminate(self) -> bool:
        if self.process:
            self.process.terminate()
            self.process = None
            return True
        return False

script_runner = ScriptRunner()

# ==================== Claude 配置管理 ====================
class ClaudeConfigManager:
    def _init_store(self):
        PROFILE_STORE_PATH.mkdir(parents=True, exist_ok=True)
        if not PROFILES_FILE.exists():
            PROFILES_FILE.write_text(json.dumps({"configs": {}, "currentProfile": None}, indent=2))
    
    def get_store(self) -> dict:
        self._init_store()
        try:
            return json.loads(PROFILES_FILE.read_text(encoding="utf-8"))
        except:
            return {"configs": {}, "currentProfile": None}
    
    def save_store(self, store: dict):
        self._init_store()
        PROFILES_FILE.write_text(json.dumps(store, indent=2, ensure_ascii=False), encoding="utf-8")
    
    def get_configs(self):
        store = self.get_store()
        return [
            {"name": name, "config": config, "isCurrent": name == store.get("currentProfile")}
            for name, config in store.get("configs", {}).items()
        ]
    
    def add_config(self, name: str, config: dict):
        store = self.get_store()
        store["configs"][name] = config
        self.save_store(store)
    
    def delete_config(self, name: str) -> bool:
        store = self.get_store()
        if name not in store.get("configs", {}):
            return False
        del store["configs"][name]
        if store.get("currentProfile") == name:
            store["currentProfile"] = None
        self.save_store(store)
        return True
    
    def switch_config(self, name: str) -> dict:
        store = self.get_store()
        if name not in store.get("configs", {}):
            return {"success": False, "message": f"配置 '{name}' 不存在"}
        
        config = store["configs"][name]
        
        # 更新 Claude 配置文件
        claude_config = {}
        if CLAUDE_CONFIG_PATH.exists():
            try:
                claude_config = json.loads(CLAUDE_CONFIG_PATH.read_text(encoding="utf-8"))
            except:
                pass
        
        claude_config["oaiBaseUrl"] = config["baseApi"]
        claude_config["oaiKey"] = config["authToken"]
        CLAUDE_CONFIG_PATH.write_text(json.dumps(claude_config, indent=2), encoding="utf-8")
        
        # 设置 Windows 用户级环境变量
        import sys
        if sys.platform == "win32":
            try:
                subprocess.run(["setx", "ANTHROPIC_AUTH_TOKEN", config["authToken"]], 
                             capture_output=True, text=True)
                subprocess.run(["setx", "ANTHROPIC_BASE_URL", config["baseApi"]], 
                             capture_output=True, text=True)
            except Exception as e:
                print(f"设置环境变量失败: {e}")
        
        # 更新当前配置
        store["currentProfile"] = name
        self.save_store(store)
        
        return {"success": True, "message": f"已切换到配置 '{name}'\n环境变量已更新（新终端生效）"}

claude_manager = ClaudeConfigManager()

# ==================== SVN 执行器 ====================
class SvnExecutor:
    async def run_command(self, cmd: str, cwd: str = None, timeout: int = 120) -> dict:
        try:
            process = await asyncio.create_subprocess_shell(
                cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=cwd
            )
            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
                return {
                    "success": process.returncode == 0,
                    "stdout": stdout.decode("utf-8", errors="replace"),
                    "stderr": stderr.decode("utf-8", errors="replace")
                }
            except asyncio.TimeoutError:
                process.kill()
                return {"success": False, "stdout": "", "stderr": "Command timeout"}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": str(e)}
    
    async def get_info(self, path_or_url: str) -> dict:
        result = await self.run_command(f'svn info "{path_or_url}"')
        if not result["success"]:
            return {"error": result["stderr"]}
        
        info = {}
        for line in result["stdout"].split("\n"):
            if ":" in line:
                key, value = line.split(":", 1)
                key = key.strip()
                value = value.strip()
                if key == "URL":
                    info["url"] = value
                elif key == "Repository Root":
                    info["repositoryRoot"] = value
                elif key == "Revision":
                    info["revision"] = value
        return info
    
    async def get_log(self, revision: str, url: str) -> dict:
        rev_arg = f"-r {revision}" if ":" in revision else f"-c {revision}"
        result = await self.run_command(f'svn log {rev_arg} -v "{url}"')
        return {"success": result["success"], "log": result["stdout"] if result["success"] else result["stderr"]}
    
    async def create_diff(self, params: SvnDiffRequest) -> dict:
        actual_url = params.url
        
        if params.fromRepoRoot:
            info = await self.get_info(params.url)
            if "repositoryRoot" in info:
                actual_url = info["repositoryRoot"]
        elif params.parentLevels > 0:
            for _ in range(params.parentLevels):
                if "/" in actual_url:
                    actual_url = actual_url.rsplit("/", 1)[0]
        
        rev_arg = f"-r {params.revision}" if ":" in params.revision else f"-c {params.revision}"
        result = await self.run_command(f'svn diff {rev_arg} "{actual_url}"', timeout=300)
        
        if not result["success"]:
            return {"success": False, "content": "", "error": result["stderr"]}
        
        return {"success": True, "content": result["stdout"]}
    
    async def apply_patch(self, params: SvnApplyRequest) -> dict:
        import tempfile
        
        # 保存临时文件
        with tempfile.NamedTemporaryFile(mode="w", suffix=".patch", delete=False, encoding="utf-8") as f:
            f.write(params.patchContent)
            temp_file = f.name
        
        try:
            # 尝试 svn patch
            result = await self.run_command(f'svn patch "{temp_file}"', cwd=params.targetDir)
            if result["success"]:
                return {"success": True, "message": "Patch 应用成功!"}
            
            # 尝试 patch 命令
            for strip in range(6):
                result = await self.run_command(f'patch -p{strip} --input="{temp_file}"', cwd=params.targetDir)
                if result["success"]:
                    return {"success": True, "message": f"Patch 应用成功 (strip level: {strip})"}
            
            return {"success": False, "message": f"应用 Patch 失败: {result['stderr']}"}
        finally:
            os.unlink(temp_file)

svn_executor = SvnExecutor()

# ==================== REST API 路由 ====================

# 脚本 API
@app.get("/api/scripts", response_model=List[ScriptInfo])
def list_scripts():
    return script_runner.list_scripts()

@app.post("/api/scripts/terminate")
def terminate_script():
    return {"success": script_runner.terminate()}

# Claude 配置 API
@app.get("/api/claude/configs")
def get_claude_configs():
    return claude_manager.get_configs()

@app.post("/api/claude/configs")
def add_claude_config(request: AddConfigRequest):
    claude_manager.add_config(request.name, request.config.dict())
    return {"success": True}

@app.delete("/api/claude/configs/{name}")
def delete_claude_config(name: str):
    success = claude_manager.delete_config(name)
    if not success:
        raise HTTPException(status_code=404, detail=f"配置 '{name}' 不存在")
    return {"success": True}

@app.post("/api/claude/switch/{name}")
def switch_claude_config(name: str):
    return claude_manager.switch_config(name)

# SVN API
@app.get("/api/svn/info")
async def get_svn_info(path: str):
    return await svn_executor.get_info(path)

@app.post("/api/svn/log")
async def get_svn_log(revision: str, url: str):
    return await svn_executor.get_log(revision, url)

@app.post("/api/svn/diff")
async def create_svn_diff(request: SvnDiffRequest):
    return await svn_executor.create_diff(request)

@app.post("/api/svn/apply")
async def apply_svn_patch(request: SvnApplyRequest):
    return await svn_executor.apply_patch(request)

# ==================== WebSocket ====================
@app.websocket("/ws/terminal")
async def websocket_terminal(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("action") == "run":
                await script_runner.run_script(data["script"], websocket)
            elif data.get("action") == "terminate":
                script_runner.terminate()
                await websocket.send_json({"type": "terminated"})
    except WebSocketDisconnect:
        script_runner.terminate()

# ==================== 静态文件 ====================
# 挂载前端静态文件
FRONTEND_DIR = Path(__file__).parent / "frontend"
if FRONTEND_DIR.exists():
    # 如果有 assets 目录才挂载
    assets_dir = FRONTEND_DIR / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")
    
    @app.get("/")
    async def serve_index():
        return FileResponse(FRONTEND_DIR / "index.html")
    
    @app.get("/{path:path}")
    async def serve_static(path: str):
        file_path = FRONTEND_DIR / path
        if file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIR / "index.html")

# ==================== 启动入口 ====================
if __name__ == "__main__":
    import uvicorn
    print("=" * 50)
    print("🛠️  CGToolbox Web 服务器启动中...")
    print("=" * 50)
    print(f"📍 访问地址: http://localhost:18432")
    print(f"📁 脚本目录: {SCRIPTS_DIR}")
    print("=" * 50)
    uvicorn.run(app, host="127.0.0.1", port=18432)
