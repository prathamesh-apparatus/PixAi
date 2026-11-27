import React from 'react';
import HistoryPage from './History';

export default function Favorites(props) {
  return <HistoryPage {...props} favoritesOnly />;
}
