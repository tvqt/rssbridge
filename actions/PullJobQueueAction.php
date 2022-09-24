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

class PullJobQueueAction implements ActionInterface
{
    public function execute(array $request)
    {
        $authenticationMiddleware = new APIAuthenticationMiddleware();
        $authenticationMiddleware();

        $channel = $request['channel'] or returnClientError('You must specify channel!');

        $jq = new JobQueue();
        $result = $jq->pull($channel);
        header('Content-Type: text/plain');
        header('Cache-Control: no-cache, no-store, must-revalidate');
        header('Pragma: no-cache');
        header('Expires: 0');
        die($result);
    }
}
