import React from 'react';
import { Link } from 'react-router-dom';

const IndexPage = () => {
  return (
    <div>
      <h1>Index Page</h1>
      <ul>
        <li><Link to="/page1">Page 1</Link></li>
        <li><Link to="/page2">Page 2</Link></li>
        {/* Add more links as needed */}
      </ul>
    </div>
  );
};

export default IndexPage;