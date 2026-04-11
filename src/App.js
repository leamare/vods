import {
  AppBar,
  Box,
  Divider,
  Pagination,
  Toolbar,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import React, { useCallback, useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";

import Footer from "./components/Footer";
import GameBox from "./components/GameBox";
import VideoPage from "./components/VideoPage";
import PlaylistPage from "./components/PlaylistPage";
import GameBoxSkeleton from "./components/GameBoxSkeleton";
import Logo from "./components/navbar/Logo";
import SearchBar from "./components/navbar/SearchBar";
import { API_URL } from "./utils/constants";
import axios from "axios";

const App = () => {
  const theme = useTheme();
  const location = useLocation();
  const mobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isVideoPage = location.pathname.startsWith('/video/');
  const isHomePage = location.pathname === '/';
  const [searchResults, setSearchResults] = useState([]);
  const [pageCount] = useState(1);
  const [page, setPage] = useState(1);
  const [initialGamesLoad, setinitialGamesLoad] = useState(Boolean);
  const [initialGames, setinitialGames] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [tagArray, setTagArray] = useState([]);
  const [searchKey, setSearchKey] = useState(0);

  useEffect(() => {
    if (!isHomePage) {
      setSearchInput("");
      setTagArray([]);
      setSearchKey((k) => k + 1);
    } else {
      window.history.replaceState(null, '', process.env.PUBLIC_URL + '/');
    }
  }, [isHomePage]);

  useEffect(() => {
    document.title = "tsunami's twitch vods";
    setinitialGamesLoad(true);
    setinitialGames([]);
    
    axios.get(`${API_URL}/getvods`)
      .then((response) => {
        const gameDatabase = response.data;
        setinitialGames(gameDatabase);
        setSearchResults(gameDatabase);
        setinitialGamesLoad(false);
      });
  }, []);

  const filterGames = useCallback(() => {
    let results = initialGames;

    if (searchInput) {
      results = results.filter((item) =>
        item.gameName.toString().toLowerCase().includes(searchInput.toLowerCase())
      );
    }

    if (tagArray.length > 0) {
      results = results.filter((item) =>
        tagArray.every((tag) => item.tags?.includes(tag))
      );
    }

    setSearchResults(results);
  }, [initialGames, searchInput, tagArray]);

  useEffect(() => {
    if (!initialGamesLoad) {
      filterGames();
    }
  }, [filterGames, initialGamesLoad]);

  const handleSearch = useCallback((value) => {
    setSearchInput(value);
  }, []);

  const addTag = useCallback((tag) => {
    setTagArray((prev) => {
      if (prev.includes(tag)) return prev;
      return [...prev, tag];
    });
  }, []);

  const clearSearch = useCallback(() => {
    setSearchInput("");
    setSearchKey((k) => k + 1);
  }, []);

  const removeTag = useCallback((tag) => {
    setTagArray((prev) => prev.filter((t) => t !== tag));
  }, []);

  const handleChange = (event, value) => {
    setPage(value);
  };

  if (isVideoPage) {
    return (
      <Routes>
        <Route path="/video/:id" element={<VideoPage />} />
      </Routes>
    );
  }

  return (
    <Box display={"flex"} flexDirection={"column"} minHeight="100vh">
      <AppBar
        position="sticky"
        sx={{
          bgcolor: "#242A43",
          backgroundImage: "none",
          boxShadow: "0px 2px 40px 0px rgb(0 0 0 / 40%)",
        }}
      >
        <Toolbar sx={{ justifyContent: "space-between" }}>
          <Logo />
          <SearchBar key={searchKey} handleSearch={handleSearch} tags={tagArray} onRemoveTag={removeTag} />
        </Toolbar>
      </AppBar>

      <Box flex={1} display="flex" flexDirection="column">
        <Routes>
          <Route path="/playlist/:id" element={<PlaylistPage />} />
          <Route path="/" element={
            <>
              <Box
                p={mobile ? "8px 8px 16px 8px" : 2}
                display={"flex"}
                flexWrap={"wrap"}
                justifyContent={"center"}
                alignContent={"flex-start"}
                minHeight={{
                  xs: "calc(100vh - 384px)",
                  mobileCard: "calc(100vh - 387px)",
                  sm: "calc(100vh - 369px)",
                }}
              >
                {initialGamesLoad ? (
                  <GameBoxSkeleton />
                ) : searchResults.length ? (
                  searchResults.map((gameData, index) => (
                    <GameBox data={gameData} addTag={addTag} clearSearch={clearSearch} key={index} />
                  ))
                ) : (
                  <Typography variant="h5" padding={3}>
                    No Results
                  </Typography>
                )}
              </Box>

              <Pagination
                count={pageCount}
                size={mobile ? "small" : ""}
                page={page}
                onChange={handleChange}
                sx={{ mb: 2, alignSelf: "center" }}
              />

              <Divider flexItem />
            </>
          } />
        </Routes>
      </Box>

      <Footer />
    </Box>
  );
};

export default App;
