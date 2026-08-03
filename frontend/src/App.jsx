import { useEffect, useState } from 'react';

function App() {
  const [msg, setMsg] = useState('');

  useEffect(() => {
    fetch('http://localhost:5000/api/test')
      .then(res => res.json())
      .then(data => setMsg(data.message));
  }, []);

  return <h1>{msg || 'Menghubungkan ke backend...'}</h1>;
}

export default App;