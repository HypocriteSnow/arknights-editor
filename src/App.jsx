import React from 'react'
import LevelEditor from './LevelEditor' // 引入你刚才放进去的文件

function App() {
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      {/* 这里就是你的关卡编辑器组件 */}
      <LevelEditor />
    </div>
  )
}

export default App