<?php

/**
 * This file is part of RSS-Bridge, a PHP project capable of generating RSS and
 * Atom feeds for websites that don't have one.
 *
 * For the full license information, please view the UNLICENSE file distributed
 * with this source code.
 *
 * @package Core
 * @license http://unlicense.org/ UNLICENSE
 * @link    https://github.com/rss-bridge/rss-bridge
 */


class JobQueue
{
    public function __construct()
    {
        if (!extension_loaded('sqlite3')) {
            print render('error.html.php', ['message' => '"sqlite3" extension not loaded. Please check "php.ini"']);
            exit;
        }

        if (!is_writable(PATH_CACHE)) {
            returnServerError(
                'RSS-Bridge does not have write permissions for '
                . PATH_CACHE . '!'
            );
        }

        $file = Configuration::getConfig(get_called_class(), 'file');
        if (empty($file)) {
            $message = sprintf('Configuration for %s missing. Please check your %s', get_called_class(), FILE_CONFIG);
            print render('error.html.php', ['message' => $message]);
            exit;
        }
        if (dirname($file) == '.') {
            $file = PATH_CACHE . $file;
        } elseif (!is_dir(dirname($file))) {
            $message = sprintf('Invalid configuration for %s. Please check your %s', get_called_class(), FILE_CONFIG);
            print render('error.html.php', ['message' => $message]);
            exit;
        }

        $isNewFile = !is_file($file);
        $this->db = new SQLite3($file);
        $this->db->enableExceptions(true);
        if ($isNewFile) {
            $this->db->exec("CREATE TABLE job_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, channel TEXT, params BLOB, UNIQUE (channel, params))");
        }
        $this->db->busyTimeout(5000);
    }

    public function __destruct() {
        $this->db->close();
        $this->db = null;
    }

    public function push($channel, $params) {
        $q = $this->db->prepare('INSERT OR IGNORE INTO job_queue (channel, params) VALUES (:channel, :params)');
        $q->bindValue(':channel', $channel);
        $q->bindValue(':params', serialize($params));
        $q->execute();

        $lastInsertId = $this->db->lastInsertRowID();
        if (!$lastInsertId) { // Already exists
            $q = $this->db->prepare('SELECT id FROM job_queue WHERE (channel, params) = (:channel, :params)');
            $q->bindValue(':channel', $channel);
            $q->bindValue(':params', serialize($params));
            $result = $q->execute();

            if ($result instanceof SQLite3Result) {
                $data = $result->fetchArray(SQLITE3_NUM);
                $lastInsertId = $data[0];
            }
        }
        return $lastInsertId;
    }

    public function pull($channel) {
        $q = $this->db->prepare('SELECT id, channel, params FROM job_queue WHERE channel = :channel ORDER BY id ASC');
        $q->bindValue(':channel', $channel);
        $result = $q->execute();
        if ($result instanceof SQLite3Result) {
            $data = $result->fetchArray(SQLITE3_ASSOC);
            if (!$data) return null;
            $this->removeJobById($data['id']);
            return unserialize($data['params']);
        }
        return null;
    }

    protected function removeJobById($id) {
        $q = $this->db->prepare('DELETE FROM job_queue WHERE id = :id');
        $q->bindValue(':id', $id);
        $q->execute();
        return $this;
    }
}
